import { withUser } from "./sql";
import { getCurrentUserId } from "@/lib/auth/server";

/**
 * Server-side wrapper around the SQL function `public.can_approve_doc(uuid)`.
 *
 * Why a wrapper: the project's `lib/db/client.ts` is a thin PostgREST-style
 * shim over raw Postgres and doesn't implement `db.rpc(...)`. Calling the
 * function via raw SQL through `withUser` keeps RLS context (`app.user_id`)
 * intact so the SECURITY DEFINER function sees the right caller.
 *
 * Returns false when the caller isn't authenticated. Admins always get
 * true; scope leads (group lead via `policy_lead` or department lead via
 * `policy_lead_department`) get true for docs in their scope. Plain
 * editors always get false — see migration 015_scoped_permissions for
 * the full SQL definition.
 */
export async function canApproveDoc(documentId: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;
  const rows = await withUser(userId, async (sql) => {
    return await sql<{ ok: boolean }[]>`
      select public.can_approve_doc(${documentId}::uuid) as ok
    `;
  });
  return rows[0]?.ok === true;
}
