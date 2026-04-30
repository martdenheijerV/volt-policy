"use server";

import { createClient } from "@/lib/db/client";

/**
 * Department CRUD + lead assignment server actions, used from the
 * Departments card on the Personen tab.
 *
 * `departments` is a flat list of organisational units (Volt Europa,
 * Volt EP, Volt Nederland, ...). `department_leads` is the join
 * table linking a `policy_lead_department` user to a department.
 *
 * All actions admin-only — enforced both by the RLS policies on the
 * tables and by an explicit check at the top of each action body, so
 * a misconfigured RLS policy can't silently expose write access.
 *
 * Result-shape contract: every action returns `{ ok: true } | { ok:
 * false, error: string }` instead of throwing. Throwing inside a
 * server action that triggers `revalidatePath` produced the generic
 * "An error occurred in the Server Components render" digest in
 * production for Mart — Next.js wraps any uncaught server-side
 * throw with that message and there's no way to see the real error
 * client-side. Returning a result lets the caller `router.refresh()`
 * on success and surface the actual error message inline on failure.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<
  | { ok: true; db: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };
    const { data: me, error: meErr } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (meErr) return { ok: false, error: meErr.message };
    if (me?.role !== "admin") return { ok: false, error: "Admin only" };
    return { ok: true, db };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Auth check failed",
    };
  }
}

export async function createDepartment(formData: FormData): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();
  if (!name) return { ok: false, error: "Department name is required" };
  const { error } = await auth.db
    .from("departments")
    .insert({ name, description: description || null });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { error } = await auth.db.from("departments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Assign a user as policy lead for a department, or unassign them.
 *
 * Side effect on assign: if the target user isn't already an admin
 * or a policy_lead_department, we promote their role to
 * policy_lead_department so the assignment actually grants rights.
 * Admins outrank the scoped role and keep their admin role.
 *
 * Side effect on unassign: we leave the role alone — the user
 * might still lead another department, and even if they don't,
 * silently demoting them isn't this action's job. Admins manage
 * roles explicitly on the same Personen page.
 */
export async function setDepartmentLead(
  departmentId: string,
  userId: string,
  assigned: boolean
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (assigned) {
    // 1. Insert the join row (idempotent — 23505 = already there).
    const { error: insertErr } = await auth.db
      .from("department_leads")
      .insert({ department_id: departmentId, user_id: userId });
    if (insertErr && insertErr.code !== "23505") {
      return { ok: false, error: insertErr.message };
    }

    // 2. Promote the user's role to policy_lead_department unless
    //    they're already that or admin (admin outranks the scoped
    //    role; demoting an admin would be wrong).
    const { data: target, error: roleReadErr } = await auth.db
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (roleReadErr) return { ok: false, error: roleReadErr.message };

    const currentRole = (target as { role?: string } | null)?.role;
    if (
      currentRole &&
      currentRole !== "admin" &&
      currentRole !== "policy_lead_department"
    ) {
      const { error: roleWriteErr } = await auth.db
        .from("profiles")
        .update({ role: "policy_lead_department" })
        .eq("id", userId);
      if (roleWriteErr) return { ok: false, error: roleWriteErr.message };
    }
    return { ok: true };
  }

  // Unassign — just delete the join row, don't touch role.
  const { error } = await auth.db
    .from("department_leads")
    .delete()
    .eq("department_id", departmentId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Set or clear a user's primary department (where they "live"
 * organisationally). Admin-only because it has knock-on effects
 * for the dashboard's default filtering and for which department
 * a newly-created document gets tagged with.
 */
export async function setUserPrimaryDepartment(
  userId: string,
  departmentId: string | null
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { error } = await auth.db
    .from("profiles")
    .update({ primary_department_id: departmentId })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
