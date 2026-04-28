import { withUser } from "./sql";
import { getCurrentUserId } from "@/lib/auth/server";
import type { EditRequestStatus } from "@/lib/types";

/**
 * Server-side helpers for the edit-rights request flow. Mirrors the
 * pattern in `approval.ts`: every call wraps `withUser` so the
 * SECURITY DEFINER functions see the right caller for RLS.
 */

export interface EditRightsRequestRow {
  id: string;
  document_id: string;
  requester_id: string;
  requester_name: string | null;
  message: string | null;
  status: EditRequestStatus;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/**
 * List edit-rights requests for a single document. RLS makes this
 * automatically scoped:
 *   * The requester sees their own request.
 *   * Admins, the doc owner, and policy_leads with can_approve see
 *     everyone's requests on this doc.
 *   * Anyone else gets an empty list.
 */
export async function listEditRequestsForDoc(
  documentId: string
): Promise<EditRightsRequestRow[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];
  return await withUser(userId, async (sql) => {
    return await sql<EditRightsRequestRow[]>`
      select r.id,
             r.document_id,
             r.requester_id,
             coalesce(p.full_name, r.requester_name_cached) as requester_name,
             r.message,
             r.status,
             r.decided_by,
             dp.full_name as decided_by_name,
             r.decided_at,
             r.decision_note,
             r.created_at
        from public.edit_rights_requests r
        left join public.profiles p  on p.id = r.requester_id
        left join public.profiles dp on dp.id = r.decided_by
       where r.document_id = ${documentId}
       order by case r.status when 'pending' then 0 else 1 end,
                r.created_at desc
    `;
  });
}

/**
 * Has the current user already filed (and not yet had decided) a request
 * for this document? Used to grey out the "Request edit rights" button
 * so users don't spam.
 */
export async function getMyOpenRequestForDoc(
  documentId: string
): Promise<EditRightsRequestRow | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const rows = await withUser(userId, async (sql) => {
    return await sql<EditRightsRequestRow[]>`
      select r.id,
             r.document_id,
             r.requester_id,
             coalesce(p.full_name, r.requester_name_cached) as requester_name,
             r.message,
             r.status,
             r.decided_by,
             null::text as decided_by_name,
             r.decided_at,
             r.decision_note,
             r.created_at
        from public.edit_rights_requests r
        left join public.profiles p on p.id = r.requester_id
       where r.document_id = ${documentId}
         and r.requester_id = ${userId}
         and r.status = 'pending'
       limit 1
    `;
  });
  return rows[0] ?? null;
}

/**
 * Can the current user decide a specific request? Wraps the
 * SECURITY DEFINER function `public.can_decide_edit_request`.
 */
export async function canDecideEditRequest(requestId: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const rows = await withUser(userId, async (sql) => {
    return await sql<{ ok: boolean }[]>`
      select public.can_decide_edit_request(${requestId}::uuid) as ok
    `;
  });
  return rows[0]?.ok === true;
}

/**
 * The full participants picture for a single document — used by the
 * "Who has access" panel. Returns three buckets:
 *
 *   * owner: the document creator (can edit by default).
 *   * permitted: users with explicit document_permissions rows. Each
 *     entry includes can_edit/can_comment so the UI can render the
 *     correct chip.
 *   * groupMembers: users who get access via a group membership +
 *     group_doc_permissions rule that matches this doc's
 *     (document_type, status). Deduplicated; one row per user.
 *
 * Pending edit-rights requests come from `listEditRequestsForDoc` — this
 * function focuses on already-granted access.
 */
export interface DocParticipants {
  owner: { id: string; name: string | null } | null;
  permitted: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    can_edit: boolean;
    can_comment: boolean;
  }>;
  groupMembers: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_group: string;
    via_group_id: string;
    can_edit: boolean;
    can_comment: boolean;
    can_approve: boolean;
  }>;
}

export async function getDocParticipants(
  documentId: string
): Promise<DocParticipants> {
  const userId = await getCurrentUserId();
  if (!userId) return { owner: null, permitted: [], groupMembers: [] };
  return await withUser(userId, async (sql) => {
    const ownerRows = await sql<{ id: string; name: string | null }[]>`
      select p.id, p.full_name as name
        from public.documents d
        left join public.profiles p on p.id = d.owner_id
       where d.id = ${documentId}
       limit 1
    `;
    const permitted = await sql<DocParticipants["permitted"]>`
      select dp.user_id,
             p.full_name as name,
             p.role,
             dp.can_edit,
             dp.can_comment
        from public.document_permissions dp
        left join public.profiles p on p.id = dp.user_id
       where dp.document_id = ${documentId}
       order by p.full_name
    `;
    // Group-derived access: a user is in a group; that group has a
    // permission rule whose document_type/status matches this doc. We
    // collapse multiple rules per (group, user) by max-OR-ing the
    // capability flags so the panel shows the user's effective access.
    const groupMembers = await sql<DocParticipants["groupMembers"]>`
      with d as (
        select id, document_type, status from public.documents
         where id = ${documentId}
      ),
      matching_perms as (
        select gp.group_id,
               bool_or(gp.can_edit)    as can_edit,
               bool_or(gp.can_comment) as can_comment,
               bool_or(gp.can_approve) as can_approve
          from public.group_doc_permissions gp
          join d on true
         where (gp.document_type is null or gp.document_type = d.document_type)
           and (gp.status        is null or gp.status        = d.status)
         group by gp.group_id
      )
      select m.user_id,
             p.full_name as name,
             p.role,
             g.name      as via_group,
             g.id        as via_group_id,
             mp.can_edit,
             mp.can_comment,
             mp.can_approve
        from matching_perms mp
        join public.user_group_members m on m.group_id = mp.group_id
        join public.user_groups g        on g.id      = mp.group_id
        left join public.profiles p      on p.id      = m.user_id
       order by p.full_name nulls last
    `;
    return {
      owner: ownerRows[0]
        ? { id: ownerRows[0].id, name: ownerRows[0].name }
        : null,
      permitted,
      groupMembers,
    };
  });
}
