"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import type { CommentKind, DocStatus, DocType } from "@/lib/types";

export async function deleteUserGdpr(
  userId: string,
  mode: "keep_name" | "anonymize"
) {
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

  if (mode === "anonymize") {
    // Wipe author name from all surviving records.
    await supabase
      .from("comments")
      .update({ author_name_cached: "Anonymous" })
      .eq("author_id", userId);
    await supabase
      .from("amendments")
      .update({ proposer_name_cached: "Anonymous" })
      .eq("proposer_id", userId);
  }
  // Drop the profile row. ON DELETE SET NULL on author_id keeps the comment body.
  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;
  await logAudit("user.gdpr_delete", "profile", userId, { mode });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function createDocument(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const title = (formData.get("title") as string)?.trim();
  const document_type = formData.get("document_type") as DocType;
  const language = (formData.get("language") as string) || "en";
  const purpose = (formData.get("purpose") as string)?.trim() || null;
  const tagsRaw = (formData.get("tags") as string) || "";
  const content = (formData.get("content") as string) || "";
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) throw new Error("Title is required");

  // Validate required custom metadata fields
  const { data: requiredFields } = await supabase
    .from("metadata_fields")
    .select("id,key,label,required,applies_to")
    .eq("required", true);
  const applicableRequired = (requiredFields ?? []).filter(
    (f) => !f.applies_to || f.applies_to === document_type
  );
  for (const f of applicableRequired) {
    const v = (formData.get(`meta_${f.key}`) as string) || "";
    if (!v.trim()) throw new Error(`${f.label} is required`);
  }

  // Generate a unique slug
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let i = 1;
  while (true) {
    const { data: existing } = await supabase
      .from("documents")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    i += 1;
    slug = `${baseSlug}-${i}`;
  }

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      title,
      slug,
      document_type,
      language,
      purpose,
      tags,
      owner_id: user.id,
      current_content: content,
      current_version: 1,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Seed first version
  await supabase.from("document_versions").insert({
    document_id: doc.id,
    version_number: 1,
    title,
    content,
    change_summary: "Initial version",
    author_id: user.id,
  });

  // Save custom metadata values
  const { data: allFields } = await supabase
    .from("metadata_fields")
    .select("id,key,applies_to");
  const applicable = (allFields ?? []).filter(
    (f) => !f.applies_to || f.applies_to === document_type
  );
  const metaRows: { document_id: string; field_id: string; value: string }[] = [];
  for (const f of applicable) {
    const v = (formData.get(`meta_${f.key}`) as string) || "";
    if (v.trim()) metaRows.push({ document_id: doc.id, field_id: f.id, value: v });
  }
  if (metaRows.length) {
    await supabase.from("document_metadata_values").insert(metaRows);
  }

  await logAudit("document.created", "document", doc.id, { title, document_type });

  revalidatePath("/documents");
  redirect(`/documents/${doc.id}`);
}

export async function setMetadataValue(
  documentId: string,
  fieldId: string,
  value: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("document_metadata_values")
    .upsert(
      { document_id: documentId, field_id: fieldId, value },
      { onConflict: "document_id,field_id" }
    );
  if (error) throw error;
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}

export async function toggleVersionHidden(
  documentId: string,
  versionNumber: number
) {
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

  const { data: doc } = await supabase
    .from("documents")
    .select("hidden_versions")
    .eq("id", documentId)
    .maybeSingle();
  const hidden = new Set<number>(doc?.hidden_versions ?? []);
  if (hidden.has(versionNumber)) hidden.delete(versionNumber);
  else hidden.add(versionNumber);
  const arr = Array.from(hidden).sort((a, b) => a - b);
  const { error } = await supabase
    .from("documents")
    .update({ hidden_versions: arr })
    .eq("id", documentId);
  if (error) throw error;
  await logAudit("version.hidden_toggled", "document", documentId, {
    version: versionNumber,
    now_hidden: hidden.has(versionNumber),
  });
  revalidatePath(`/documents/${documentId}/history`);
  return { ok: true };
}

export async function saveNewVersion(
  documentId: string,
  data: { title: string; content: string; change_summary: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: doc, error: fetchErr } = await supabase
    .from("documents")
    .select("current_version,status")
    .eq("id", documentId)
    .single();
  if (fetchErr) throw fetchErr;

  // Enforce a non-empty change summary on review/approved docs (req. #13).
  // Return a serialisable error rather than throwing — Next.js 15 converts
  // server-action throws into a generic "Server Components render" error
  // page which masks the real reason from the user.
  if (
    (doc?.status === "review" || doc?.status === "approved") &&
    !data.change_summary.trim()
  ) {
    return {
      ok: false as const,
      error:
        "A change summary is required for documents in review or approved status.",
    };
  }

  const nextVersion = (doc?.current_version ?? 0) + 1;

  const { error: insertErr } = await supabase.from("document_versions").insert({
    document_id: documentId,
    version_number: nextVersion,
    title: data.title,
    content: data.content,
    change_summary: data.change_summary || null,
    author_id: user.id,
  });
  if (insertErr) {
    return { ok: false as const, error: insertErr.message };
  }

  const { error: updateErr } = await supabase
    .from("documents")
    .update({
      title: data.title,
      current_content: data.content,
      current_version: nextVersion,
    })
    .eq("id", documentId);
  if (updateErr) {
    return { ok: false as const, error: updateErr.message };
  }

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  return { ok: true as const, version: nextVersion };
}

export async function updateStatus(documentId: string, status: DocStatus) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  const { error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId);
  if (error) throw error;
  await logAudit("document.status_changed", "document", documentId, { status });
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/library");
  return { ok: true };
}

export async function restoreVersion(
  documentId: string,
  versionNumber: number
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: v, error } = await supabase
    .from("document_versions")
    .select("title,content")
    .eq("document_id", documentId)
    .eq("version_number", versionNumber)
    .single();
  if (error) throw error;

  await saveNewVersion(documentId, {
    title: v.title,
    content: v.content,
    change_summary: `Restored from v${versionNumber}`,
  });
  await logAudit("document.version_restored", "document", documentId, {
    from_version: versionNumber,
  });
  return { ok: true };
}

export async function addComment(
  documentId: string,
  body: string,
  anchorQuote: string | null,
  parentId: string | null,
  kind: CommentKind = "general"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("comments").insert({
    document_id: documentId,
    author_id: user.id,
    author_name_cached: profile?.full_name ?? user.email ?? null,
    parent_id: parentId,
    body,
    anchor_quote: anchorQuote,
    kind,
  });
  if (error) throw error;
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}

export async function resolveComment(commentId: string, resolved: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .update({ resolved })
    .eq("id", commentId);
  if (error) throw error;
  return { ok: true };
}
