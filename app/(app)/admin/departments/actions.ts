"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";

/**
 * Server actions for /admin/departments/<id>. Mirror the shape of
 * the group actions (../groups/actions.ts) — same vocabulary, same
 * upsert semantics — so the two admin surfaces feel identical.
 *
 * Auth model: setMemberRights is callable by admins AND department
 * leads (RLS policy `dmp_lead_write` enforces this at the DB layer).
 * The other actions stay admin-only because adding/removing members
 * and managing the department itself is structural.
 */

async function requireAdmin() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") throw new Error("Admin only");
  return db;
}

/**
 * Add a user as a member of a department. Mirrors addMember in the
 * groups actions: creates the per-member rights row at the same time
 * with default can_read=true, can_edit=false.
 */
export async function addDepartmentMember(
  departmentId: string,
  userId: string
) {
  const db = await requireAdmin();
  const { error } = await db
    .from("department_member_permissions")
    .insert({
      department_id: departmentId,
      user_id: userId,
      can_read: true,
      can_edit: false,
    });
  if (error && error.code !== "23505") throw error;
  revalidatePath(`/admin/departments/${departmentId}`);
  return { ok: true };
}

export async function removeDepartmentMember(
  departmentId: string,
  userId: string
) {
  const db = await requireAdmin();
  const { error } = await db
    .from("department_member_permissions")
    .delete()
    .eq("department_id", departmentId)
    .eq("user_id", userId);
  if (error) throw error;
  revalidatePath(`/admin/departments/${departmentId}`);
  return { ok: true };
}

/**
 * Set a department member's per-rights flags. Callable by admin OR
 * department lead (with role policy_lead_department) — RLS on
 * department_member_permissions enforces.
 */
export async function setDepartmentMemberRights(
  departmentId: string,
  userId: string,
  rights: { can_read: boolean; can_edit: boolean }
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await db
    .from("department_member_permissions")
    .upsert(
      {
        department_id: departmentId,
        user_id: userId,
        can_read: rights.can_read || rights.can_edit,
        can_edit: rights.can_edit,
      },
      { onConflict: "department_id,user_id" }
    );
  if (error) throw error;
  revalidatePath(`/admin/departments/${departmentId}`);
  return { ok: true };
}
