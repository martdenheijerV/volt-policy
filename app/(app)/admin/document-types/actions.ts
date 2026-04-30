"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/client";
import type { DocType } from "@/lib/types";

/**
 * Set or clear a (group × doc_type) read/edit permission.
 *
 * Storage: a row in `group_doc_permissions` with `status = null`
 * (applies to every status of that doc type). We keep at most one
 * "type-level, status-agnostic" row per (group, type); per-status
 * overrides remain available via the existing group detail page
 * but aren't surfaced in this matrix to keep the grid scannable.
 *
 * Rules: if both flags are off we delete the row entirely (cleaner
 * than carrying around can_read=false rows). Otherwise we upsert.
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

export async function setDocTypePermission(
  groupId: string,
  docType: DocType,
  flags: { canRead: boolean; canEdit: boolean }
) {
  const supabase = await requireAdmin();

  // Find the existing type-level (status-agnostic) row for this pair,
  // if any. We deliberately ignore rows with non-null status — those
  // are per-status overrides set in the group detail page and stay
  // out of the matrix's responsibility.
  const { data: existing } = await supabase
    .from("group_doc_permissions")
    .select("id")
    .eq("group_id", groupId)
    .eq("document_type", docType)
    .is("status", null)
    .maybeSingle();

  // Both off → delete the row entirely. Storing a "no permissions"
  // row would be misleading the next time someone reads the matrix.
  if (!flags.canRead && !flags.canEdit) {
    if (existing) {
      await supabase.from("group_doc_permissions").delete().eq("id", existing.id);
    }
    revalidatePath("/admin/document-types");
    return { ok: true };
  }

  // Editing implies reading. UI also enforces this client-side, but
  // we double-check on the server so a stale form doesn't store a
  // contradictory pair.
  const can_read = flags.canRead || flags.canEdit;
  const can_edit = flags.canEdit;
  // can_comment defaults to true when can_read — keeps the existing
  // "if you can read it, you can comment" convention from
  // group_doc_permissions, callers who want comment-only should use
  // the per-group detail page.
  const can_comment = can_read;

  if (existing) {
    await supabase
      .from("group_doc_permissions")
      .update({ can_read, can_edit, can_comment })
      .eq("id", existing.id);
  } else {
    await supabase.from("group_doc_permissions").insert({
      group_id: groupId,
      document_type: docType,
      status: null,
      can_read,
      can_edit,
      can_comment,
    });
  }
  revalidatePath("/admin/document-types");
  return { ok: true };
}
