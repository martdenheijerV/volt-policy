"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@/lib/types";

/**
 * Change a user's role. Admin-only — enforced by RLS on `profiles` plus the
 * is_admin() guard in the server action body.
 */
export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    throw new Error("Only admins can change user roles.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  await logAudit("role_change", "profile", userId, { new_role: role });
  revalidatePath("/admin/users");
}
