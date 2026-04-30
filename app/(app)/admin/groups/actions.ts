"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";

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

export async function createGroup(formData: FormData) {
  const db = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();
  if (!name) throw new Error("Group name is required");

  const { data, error } = await db
    .from("user_groups")
    .insert({ name, description })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/admin/groups");
  redirect(`/admin/groups/${data.id}`);
}

export async function deleteGroup(id: string) {
  const db = await requireAdmin();
  const { error } = await db.from("user_groups").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/groups");
  return { ok: true };
}

/**
 * Add a user to a group. After 015_scoped_permissions, group
 * membership and per-member rights are stored in two tables:
 *   - user_group_members  (the membership; cosmetic, used for admin
 *     UI listings)
 *   - user_group_member_permissions  (the rights row; can_read /
 *     can_edit per member, default true / false)
 *
 * Adding a member here creates *both* rows in lock-step. The
 * permissions row's defaults match the user-facing convention from
 * the spec ("members default to read; lead must promote to edit").
 */
export async function addMember(groupId: string, userId: string) {
  const db = await requireAdmin();
  const { error: m } = await db
    .from("user_group_members")
    .insert({ group_id: groupId, user_id: userId });
  if (m && m.code !== "23505") throw m;

  const { error: p } = await db
    .from("user_group_member_permissions")
    .insert({
      group_id: groupId,
      user_id: userId,
      can_read: true,
      can_edit: false,
    });
  if (p && p.code !== "23505") throw p;

  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}

/**
 * Remove a user from a group. ON DELETE CASCADE on
 * user_group_member_permissions(group_id, user_id) automatically
 * removes their rights row, so we only need to delete the membership.
 */
export async function removeMember(groupId: string, userId: string) {
  const db = await requireAdmin();
  const { error } = await db
    .from("user_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
  // Belt-and-braces: explicitly clear the permissions row in case the
  // membership row had already been removed manually and we're
  // re-running cleanup.
  await db
    .from("user_group_member_permissions")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}

/**
 * Set a group member's per-rights flags. Used by the toggle UI on
 * the group detail page. RLS gates this on (admin OR group lead with
 * role policy_lead) so a non-admin lead can flip can_edit on their
 * own group's members without sliding into requireAdmin().
 */
export async function setMemberRights(
  groupId: string,
  userId: string,
  rights: { can_read: boolean; can_edit: boolean }
) {
  // Note: NOT requireAdmin — leads also call this. The RLS policy
  // ugmp_lead_write enforces the auth check at the database layer.
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await db
    .from("user_group_member_permissions")
    .upsert(
      {
        group_id: groupId,
        user_id: userId,
        can_read: rights.can_read || rights.can_edit, // edit implies read
        can_edit: rights.can_edit,
      },
      { onConflict: "group_id,user_id" }
    );
  if (error) throw error;
  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}

/**
 * Mark or un-mark a group member as the group's policy lead. Stored
 * in `user_group_leads`. The user's profiles.role should be
 * `policy_lead` (or `policy_lead_department`) for the assignment to
 * grant approve rights elsewhere — we don't enforce that here so
 * admins can pre-populate before flipping the role.
 */
export async function setGroupLead(
  groupId: string,
  userId: string,
  assigned: boolean
) {
  const db = await requireAdmin();
  if (assigned) {
    const { error } = await db
      .from("user_group_leads")
      .insert({ group_id: groupId, user_id: userId });
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await db
      .from("user_group_leads")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (error) throw error;
  }
  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}
