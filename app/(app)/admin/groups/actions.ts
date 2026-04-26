"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";

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

export async function createGroup(formData: FormData) {
  const supabase = await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const description = ((formData.get("description") as string) || "").trim();
  if (!name) throw new Error("Group name is required");

  const { data, error } = await supabase
    .from("user_groups")
    .insert({ name, description })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/admin/groups");
  redirect(`/admin/groups/${data.id}`);
}

export async function deleteGroup(id: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("user_groups").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/groups");
  return { ok: true };
}

export async function addMember(groupId: string, userId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("user_group_members")
    .insert({ group_id: groupId, user_id: userId });
  if (error && error.code !== "23505") throw error;
  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}

export async function removeMember(groupId: string, userId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("user_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw error;
  revalidatePath(`/admin/groups/${groupId}`);
  return { ok: true };
}

export async function addGroupPermission(formData: FormData) {
  const supabase = await requireAdmin();
  const group_id = formData.get("group_id") as string;
  const document_type = (formData.get("document_type") as string) || null;
  const status = (formData.get("status") as string) || null;
  const can_read = formData.get("can_read") === "on";
  const can_edit = formData.get("can_edit") === "on";
  const can_comment = formData.get("can_comment") === "on";
  const { error } = await supabase.from("group_doc_permissions").insert({
    group_id,
    document_type: document_type || null,
    status: status || null,
    can_read,
    can_edit,
    can_comment,
  });
  if (error) throw error;
  revalidatePath(`/admin/groups/${group_id}`);
}

export async function deleteGroupPermission(id: string, groupId: string) {
  const supabase = await requireAdmin();
  await supabase.from("group_doc_permissions").delete().eq("id", id);
  revalidatePath(`/admin/groups/${groupId}`);
}
