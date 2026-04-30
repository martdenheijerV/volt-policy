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
 * "Who has access" panel. Returns four buckets:
 *
 *   * owner: the document creator (can edit by default).
 *   * permitted: users with explicit document_permissions rows. Each
 *     entry includes can_edit/can_comment so the UI can render the
 *     correct chip.
 *   * scopeMembers: users who get access via the doc's scope — either
 *     `user_group_member_permissions` (when documents.group_id is set)
 *     or `department_member_permissions` (when documents.department_id
 *     is set). One row per user; flags reflect their effective rights.
 *   * scopeLeads: users with lead status on the doc's scope. Always
 *     have full rights (read/edit/approve) within scope, regardless
 *     of any per-member row.
 *
 * Pending edit-rights requests come from `listEditRequestsForDoc` — this
 * function focuses on already-granted access.
 *
 * Schema rationale: we no longer surface "via group X due to matrix
 * rule on doc_type Y" — since 015_scoped_permissions, access is one
 * level simpler (you're in the scope, period). The `via_scope_kind` /
 * `via_scope_name` columns let the UI label whether the source was a
 * working group or a department.
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
  scopeMembers: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_scope_kind: "group" | "department";
    via_scope_id: string;
    via_scope_name: string;
    can_read: boolean;
    can_edit: boolean;
  }>;
  scopeLeads: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_scope_kind: "group" | "department";
    via_scope_id: string;
    via_scope_name: string;
  }>;
}

export async function getDocParticipants(
  documentId: string
): Promise<DocParticipants> {
  const userId = await getCurrentUserId();
  if (!userId)
    return {
      owner: null,
      permitted: [],
      scopeMembers: [],
      scopeLeads: [],
    };
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
    // Scope members: union of group members (when doc.group_id is
    // set) and department members (when doc.department_id is set). The
    // XOR check on documents guarantees only one branch returns rows.
    const scopeMembers = await sql<DocParticipants["scopeMembers"]>`
      with d as (
        select id, group_id, department_id from public.documents
         where id = ${documentId}
      )
      select ugmp.user_id,
             p.full_name as name,
             p.role,
             'group'::text as via_scope_kind,
             g.id   as via_scope_id,
             g.name as via_scope_name,
             ugmp.can_read,
             ugmp.can_edit
        from d
        join public.user_group_member_permissions ugmp
          on ugmp.group_id = d.group_id
        join public.user_groups g on g.id = ugmp.group_id
        left join public.profiles p on p.id = ugmp.user_id
       where d.group_id is not null
       union all
      select dmp.user_id,
             p.full_name as name,
             p.role,
             'department'::text as via_scope_kind,
             dep.id   as via_scope_id,
             dep.name as via_scope_name,
             dmp.can_read,
             dmp.can_edit
        from d
        join public.department_member_permissions dmp
          on dmp.department_id = d.department_id
        join public.departments dep on dep.id = dmp.department_id
        left join public.profiles p on p.id = dmp.user_id
       where d.department_id is not null
       order by name nulls last
    `;
    // Scope leads: same idea, from user_group_leads / department_leads.
    const scopeLeads = await sql<DocParticipants["scopeLeads"]>`
      with d as (
        select id, group_id, department_id from public.documents
         where id = ${documentId}
      )
      select ugl.user_id,
             p.full_name as name,
             p.role,
             'group'::text as via_scope_kind,
             g.id   as via_scope_id,
             g.name as via_scope_name
        from d
        join public.user_group_leads ugl on ugl.group_id = d.group_id
        join public.user_groups g on g.id = ugl.group_id
        left join public.profiles p on p.id = ugl.user_id
       where d.group_id is not null
       union all
      select dl.user_id,
             p.full_name as name,
             p.role,
             'department'::text as via_scope_kind,
             dep.id   as via_scope_id,
             dep.name as via_scope_name
        from d
        join public.department_leads dl on dl.department_id = d.department_id
        join public.departments dep on dep.id = dl.department_id
        left join public.profiles p on p.id = dl.user_id
       where d.department_id is not null
       order by name nulls last
    `;
    return {
      owner: ownerRows[0]
        ? { id: ownerRows[0].id, name: ownerRows[0].name }
        : null,
      permitted,
      scopeMembers,
      scopeLeads,
    };
  });
}
