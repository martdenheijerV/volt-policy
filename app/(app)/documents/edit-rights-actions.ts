"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { canDecideEditRequest } from "@/lib/db/edit-rights";
import { logAudit } from "@/lib/audit";

/**
 * Server actions for the edit-rights request flow.
 *
 * Why a separate file from `actions.ts`:
 *   * Smaller surface area to review for security.
 *   * `actions.ts` is already huge — keeping the new feature self-contained
 *     means it can be removed in one delete if requirements change.
 *   * Each action calls revalidatePath only on the document page so the
 *     dashboard's "my pending requests" sidebar is allowed to lag a bit
 *     (it'll catch up on the next render).
 */

interface ActionResult {
  ok: boolean;
  error?: string;
  requestId?: string;
}

/**
 * Create a pending edit-rights request from the current user against a
 * specific document. The DB has a partial unique index that already
 * prevents a user from filing two pending requests against the same
 * doc — but we surface a friendly error rather than a constraint
 * violation.
 */
export async function requestEditRights(
  documentId: string,
  message: string | null
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };

  // Look up the user's display name so we can cache it on the row. Keeps
  // the request readable in the audit log even if the profile is later
  // GDPR-deleted (in which case requester_id goes null but
  // requester_name_cached survives).
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle<{ full_name: string | null }>();

  const trimmedMessage = (message ?? "").trim().slice(0, 500) || null;

  try {
    const inserted = await withUser(userId, async (sql) => {
      // The partial unique index `edit_rights_requests_one_pending` blocks
      // a second pending row; on conflict we just return the existing
      // pending row's id so the UI stays idempotent.
      const rows = await sql<{ id: string }[]>`
        insert into public.edit_rights_requests
          (document_id, requester_id, requester_name_cached, message, status)
        values
          (${documentId}::uuid, ${userId}::uuid, ${profile?.full_name ?? null},
           ${trimmedMessage}, 'pending')
        on conflict (document_id, requester_id) where status = 'pending'
        do update set updated_at = now()
        returning id
      `;
      return rows[0];
    });
    await logAudit("edit_rights.request", "edit_rights_request", inserted.id, {
      document_id: documentId,
      message: trimmedMessage,
    });
    revalidatePath(`/documents/${documentId}`);
    revalidatePath("/dashboard");
    return { ok: true, requestId: inserted.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    return { ok: false, error: msg };
  }
}

/**
 * Approve or reject a pending request. Authorization runs through
 * `can_decide_edit_request` (which is admin OR doc owner OR
 * can_approve_doc). When approving, the DB trigger
 * `apply_approved_edit_request` mirrors the request into
 * document_permissions(can_edit=true) so the requester immediately gains
 * write access on the next page render.
 */
export async function decideEditRequest(
  requestId: string,
  decision: "approved" | "rejected",
  note: string | null
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };

  // Defense in depth: the RLS update policy already blocks unauthorized
  // deciders, but checking here lets us return a clear error string
  // instead of "0 rows updated".
  const allowed = await canDecideEditRequest(requestId);
  if (!allowed) return { ok: false, error: "Not authorized to decide this request" };

  const trimmedNote = (note ?? "").trim().slice(0, 500) || null;

  try {
    const updated = await withUser(userId, async (sql) => {
      const rows = await sql<
        { id: string; document_id: string; requester_id: string }[]
      >`
        update public.edit_rights_requests
           set status = ${decision}::public.edit_request_status,
               decided_by = ${userId}::uuid,
               decided_at = now(),
               decision_note = ${trimmedNote}
         where id = ${requestId}::uuid
           and status = 'pending'
        returning id, document_id, requester_id
      `;
      return rows[0];
    });

    if (!updated) {
      return { ok: false, error: "Request was already decided or no longer exists" };
    }

    await logAudit(
      `edit_rights.${decision}`,
      "edit_rights_request",
      updated.id,
      {
        document_id: updated.document_id,
        requester_id: updated.requester_id,
        note: trimmedNote,
      }
    );
    revalidatePath(`/documents/${updated.document_id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return { ok: false, error: msg };
  }
}

/**
 * The requester cancels their own pending request before anyone decided.
 * Useful when they realise they don't actually need edit rights, or
 * filed against the wrong doc. Cancelled rows stay in the table for
 * audit trail purposes.
 */
export async function cancelEditRequest(
  requestId: string
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };
  try {
    const updated = await withUser(userId, async (sql) => {
      const rows = await sql<{ id: string; document_id: string }[]>`
        update public.edit_rights_requests
           set status = 'cancelled'::public.edit_request_status,
               decided_at = now(),
               decided_by = ${userId}::uuid
         where id = ${requestId}::uuid
           and requester_id = ${userId}::uuid
           and status = 'pending'
        returning id, document_id
      `;
      return rows[0];
    });
    if (!updated) return { ok: false, error: "Nothing to cancel" };
    await logAudit("edit_rights.cancel", "edit_rights_request", updated.id, {
      document_id: updated.document_id,
    });
    revalidatePath(`/documents/${updated.document_id}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cancel failed";
    return { ok: false, error: msg };
  }
}

/**
 * Direct grant by an admin / doc owner / approver. Bypasses the
 * request-and-approve loop when an approver wants to give someone edit
 * rights immediately (e.g. they just verbally agreed in a meeting). The
 * row in document_permissions is the canonical "X can edit doc Y" fact;
 * the request flow just creates these rows automatically.
 */
export async function grantEditRights(
  documentId: string,
  granteeUserId: string
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id")
    .eq("id", documentId)
    .maybeSingle<{ owner_id: string | null }>();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();

  // Mirror the can_decide_edit_request rule. We avoid calling the SQL
  // function here because the doc may not have a request yet.
  const isAdmin = me?.role === "admin";
  const isOwner = doc?.owner_id === userId;
  // Lazy import to dodge a circular dep if approval.ts ever needs this.
  const { canApproveDoc } = await import("@/lib/db/approval");
  const canApprove = await canApproveDoc(documentId);
  if (!isAdmin && !isOwner && !canApprove) {
    return { ok: false, error: "Not authorized" };
  }

  try {
    await withUser(userId, async (sql) => {
      await sql`
        insert into public.document_permissions
          (document_id, user_id, can_edit, can_comment)
        values
          (${documentId}::uuid, ${granteeUserId}::uuid, true, true)
        on conflict (document_id, user_id) do update
          set can_edit = true,
              can_comment = true
      `;
    });
    await logAudit(
      "edit_rights.direct_grant",
      "document_permission",
      `${documentId}:${granteeUserId}`,
      { document_id: documentId, user_id: granteeUserId }
    );
    revalidatePath(`/documents/${documentId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Grant failed";
    return { ok: false, error: msg };
  }
}

/**
 * Revoke an explicit edit grant. Doesn't delete the row — sets
 * can_edit=false so we keep the audit trail of "this user once had
 * access". They can still comment unless can_comment is also flipped
 * separately.
 */
export async function revokeEditRights(
  documentId: string,
  granteeUserId: string
): Promise<ActionResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("owner_id")
    .eq("id", documentId)
    .maybeSingle<{ owner_id: string | null }>();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string | null }>();

  const isAdmin = me?.role === "admin";
  const isOwner = doc?.owner_id === userId;
  const { canApproveDoc } = await import("@/lib/db/approval");
  const canApprove = await canApproveDoc(documentId);
  if (!isAdmin && !isOwner && !canApprove) {
    return { ok: false, error: "Not authorized" };
  }

  try {
    await withUser(userId, async (sql) => {
      await sql`
        update public.document_permissions
           set can_edit = false
         where document_id = ${documentId}::uuid
           and user_id = ${granteeUserId}::uuid
      `;
    });
    await logAudit(
      "edit_rights.revoke",
      "document_permission",
      `${documentId}:${granteeUserId}`,
      { document_id: documentId, user_id: granteeUserId }
    );
    revalidatePath(`/documents/${documentId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Revoke failed";
    return { ok: false, error: msg };
  }
}
