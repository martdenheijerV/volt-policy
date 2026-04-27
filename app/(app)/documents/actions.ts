"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { canApproveDoc } from "@/lib/db/approval";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { notifyAdminsOfPendingReview } from "@/lib/email";
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
    .select("current_version,status,title,approved_version_number")
    .eq("id", documentId)
    .single();
  if (fetchErr) throw fetchErr;

  // Lock-during-review: while status='review' NOBODY can save — not even
  // admin or policy_lead. The snapshot the approver clicks "Approve" on
  // must equal what was sent up. If something needs to change, the
  // approver rejects, editors fix, then it goes back to review.
  if (doc?.status === "review") {
    return {
      ok: false as const,
      error:
        "This document is under review. Editing is locked until an admin approves or rejects.",
    };
  }

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

  // Fire off an admin notification when this save creates a pending-review
  // state on a previously-approved doc. Editors can stage changes without
  // touching the public version; admins decide whether to publish.
  const docRow = doc as {
    current_version: number;
    status: string;
    title: string;
    approved_version_number: number | null;
  } | null;
  if (
    docRow?.status === "approved" &&
    typeof docRow.approved_version_number === "number" &&
    docRow.approved_version_number !== nextVersion
  ) {
    // Resolve admin emails + the editor's display name. We do this best-effort
    // and never let a mail failure break the save itself.
    try {
      const { data: admins } = await supabase
        .from("profiles")
        .select("email,full_name")
        .eq("role", "admin");
      const { data: editor } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle<{ full_name: string }>();
      const adminEmails = (
        (admins ?? []) as { email: string | null }[]
      )
        .map((a) => a.email)
        .filter((e): e is string => typeof e === "string" && e.length > 0);
      const appBaseUrl = new URL(
        process.env.OIDC_REDIRECT_URI ?? "https://policy.voltmaastricht.nl"
      ).origin;
      await notifyAdminsOfPendingReview({
        adminEmails,
        documentTitle: docRow.title,
        documentId,
        editorName: editor?.full_name ?? "An editor",
        newVersion: nextVersion,
        approvedVersion: docRow.approved_version_number,
        changeSummary: data.change_summary || null,
        appBaseUrl,
      });
    } catch (e) {
      console.error("[saveNewVersion] admin notification failed:", e);
    }
  }

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  return { ok: true as const, version: nextVersion };
}

export async function updateStatus(documentId: string, status: DocStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // Approval check: admin always; otherwise we ask the SQL helper
  // which understands the policy_lead + group permission scoping.
  let canApproveThisDoc = me?.role === "admin";
  if (!canApproveThisDoc && me?.role === "policy_lead") {
    canApproveThisDoc = await canApproveDoc(documentId);
  }

  // Workflow gates (defense in depth — UI also hides the buttons):
  // - Editors / admins / policy_leads can send docs to review.
  // - Only admins can archive.
  // - approve requires canApproveThisDoc (admin or scoped policy_lead).
  if (status === "approved") {
    if (!canApproveThisDoc) {
      return {
        ok: false as const,
        error: "You don't have approval rights on this document.",
      };
    }
  } else if (status === "archived") {
    if (me?.role !== "admin") {
      return {
        ok: false as const,
        error: "Only admins can archive documents.",
      };
    }
  } else if (
    me?.role !== "admin" &&
    me?.role !== "editor" &&
    me?.role !== "policy_lead"
  ) {
    return {
      ok: false as const,
      error: "Only editors, policy leads or admins can change document status.",
    };
  }

  const patch: Record<string, unknown> = { status };

  if (status === "review") {
    // Freeze a snapshot at "send to review" time. Editors are locked
    // out of the doc while status='review', so what the reviewer sees
    // is exactly what gets approved or rejected.
    const { data: cur } = await supabase
      .from("documents")
      .select("current_version")
      .eq("id", documentId)
      .maybeSingle();
    if (!cur?.current_version) {
      return {
        ok: false as const,
        error: "Save the document at least once before sending it to review.",
      };
    }
    patch.review_version_number = cur.current_version;
  }

  if (status === "approved") {
    patch.approved_at = new Date().toISOString();
    // The approved snapshot = the version that was sent for review.
    // Falls back to current_version only for legacy data where
    // review_version_number was never set.
    const { data: cur } = await supabase
      .from("documents")
      .select("current_version,review_version_number")
      .eq("id", documentId)
      .maybeSingle();
    const approveVersion =
      cur?.review_version_number ?? cur?.current_version ?? null;
    if (approveVersion) {
      patch.approved_version_number = approveVersion;
    }
    // Clear the review pointer — review is over.
    patch.review_version_number = null;
  }

  if (status === "draft") {
    // Going back to draft (e.g. after a reject) clears the pending
    // review snapshot so editors can iterate freely again.
    patch.review_version_number = null;
  }

  const { error } = await supabase
    .from("documents")
    .update(patch)
    .eq("id", documentId);
  if (error) return { ok: false as const, error: error.message };
  await logAudit("document.status_changed", "document", documentId, { status });
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/library");
  return { ok: true as const };
}

/**
 * Admin-only. Marks the current `current_version` as the new public-facing
 * snapshot, replacing whatever was previously approved. Used after an editor
 * has saved a new version on an already-approved doc — the public library
 * keeps showing the previous snapshot until this is called.
 */
export async function approvePendingChanges(
  documentId: string
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  let canApproveThisDoc = me?.role === "admin";
  if (!canApproveThisDoc && me?.role === "policy_lead") {
    canApproveThisDoc = await canApproveDoc(documentId);
  }
  if (!canApproveThisDoc) {
    return {
      ok: false,
      error: "You don't have approval rights on this document.",
    };
  }

  const { data: cur } = await supabase
    .from("documents")
    .select("current_version,status")
    .eq("id", documentId)
    .maybeSingle();
  if (!cur) return { ok: false, error: "Document not found." };

  const { error } = await supabase
    .from("documents")
    .update({
      approved_version_number: cur.current_version,
      approved_at: new Date().toISOString(),
      status: cur.status === "archived" ? "archived" : "approved",
    })
    .eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  await logAudit("document.changes_approved", "document", documentId, {
    version: cur.current_version,
  });

  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/library");
  return { ok: true, version: cur.current_version };
}

/**
 * Admin-only. Discards the working draft by reverting `current_content` to
 * whatever was previously approved. The intermediate versions stay in
 * `document_versions` for audit; nothing is destroyed, only the head pointer
 * is moved back. Used when the admin rejects an editor's pending edits.
 */
export async function rejectPendingChanges(
  documentId: string,
  reason?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  let canRejectThisDoc = me?.role === "admin";
  if (!canRejectThisDoc && me?.role === "policy_lead") {
    canRejectThisDoc = await canApproveDoc(documentId);
  }
  if (!canRejectThisDoc) {
    return {
      ok: false,
      error: "You don't have approval rights on this document.",
    };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("approved_version_number,current_version,title")
    .eq("id", documentId)
    .maybeSingle<{
      approved_version_number: number | null;
      current_version: number;
      title: string;
    }>();
  if (!doc) return { ok: false, error: "Document not found." };
  if (!doc.approved_version_number) {
    return {
      ok: false,
      error: "No previously-approved version to revert to.",
    };
  }
  if (doc.approved_version_number === doc.current_version) {
    return { ok: false, error: "There are no pending changes to reject." };
  }

  const { data: snap } = await supabase
    .from("document_versions")
    .select("content,title")
    .eq("document_id", documentId)
    .eq("version_number", doc.approved_version_number)
    .maybeSingle<{ content: string; title: string }>();
  if (!snap) {
    return {
      ok: false,
      error: `Approved snapshot v${doc.approved_version_number} is missing.`,
    };
  }

  // Insert a new version that re-publishes the approved content so the
  // history stays linear and a future "restore" is easy to spot.
  const nextVersion = doc.current_version + 1;
  await supabase.from("document_versions").insert({
    document_id: documentId,
    version_number: nextVersion,
    title: snap.title,
    content: snap.content,
    change_summary: `Reverted to v${doc.approved_version_number} (admin rejected pending changes${
      reason ? `: ${reason}` : ""
    })`,
    author_id: user.id,
  });

  const { error } = await supabase
    .from("documents")
    .update({
      title: snap.title,
      current_content: snap.content,
      current_version: nextVersion,
      approved_version_number: nextVersion,
      approved_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  await logAudit("document.changes_rejected", "document", documentId, {
    rolled_back_to: doc.approved_version_number,
    reason: reason ?? null,
  });

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
