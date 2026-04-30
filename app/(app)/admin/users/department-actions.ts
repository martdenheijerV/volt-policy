"use server";

import { revalidatePath } from "next/cache";
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
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") throw new Error("Admin only");
  return supabase;
}

export async function createDepartment(formData: FormData) {
  const supabase = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();
  if (!name) throw new Error("Department name is required");
  const { error } = await supabase
    .from("departments")
    .insert({ name, description: description || null });
  if (error) throw error;
  revalidatePath("/admin/users");
}

export async function deleteDepartment(id: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/users");
}

/**
 * Assign a user as policy lead for a department, or unassign them.
 * The user's profile role must already be `policy_lead_department`
 * — the join row alone doesn't grant any rights, the SECURITY
 * DEFINER helper checks both sides. We surface that as a soft hint
 * in the UI rather than a hard server-side block, so admins can
 * pre-populate assignments before flipping a user's role.
 */
export async function setDepartmentLead(
  departmentId: string,
  userId: string,
  assigned: boolean
) {
  const supabase = await requireAdmin();
  if (assigned) {
    const { error } = await supabase
      .from("department_leads")
      .insert({ department_id: departmentId, user_id: userId });
    // 23505 = unique violation, treat as idempotent.
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase
      .from("department_leads")
      .delete()
      .eq("department_id", departmentId)
      .eq("user_id", userId);
    if (error) throw error;
  }
  revalidatePath("/admin/users");
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
) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ primary_department_id: departmentId })
    .eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin/users");
}
