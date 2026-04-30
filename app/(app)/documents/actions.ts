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

  if (mode === "anonymize") {
    // Wipe author name from all surviving records.
    await db
      .from("comments")
      .update({ author_name_cached: "Anonymous" })
      .eq("author_id", userId);
    await db
      .from("amendments")
      .update({ proposer_name_cached: "Anonymous" })
      .eq("proposer_id", userId);
  }
  // Drop the profile row. ON DELETE SET NULL on author_id keeps the comment body.
  const { error } = await db.from("profiles").delete().eq("id", userId);
  if (error) throw error;
  await logAudit("user.gdpr_delete", "profile", userId, { mode });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function createDocument(formData: FormData) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
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
  // Citations / Bronnen is always-on now — the form-level checkbox
  // was removed. We keep writing the column for any downstream code
  // that might still read it; the value is just always true.
  const citations_enabled = true;

  // Scope picker: form sends three loose fields:
  //   scope_kind            ("group" | "department") from the radio
  //   scope_group_id        chosen group id (only relevant when kind = group)
  //   scope_department_id   chosen department id (only when kind = department)
  // We pick the right one server-side based on scope_kind. This used
  // to be a single composed hidden field rewritten by an inline
  // <script> on submit, but server-rendered scripts don't fire
  // reliably during Next.js streaming/hydration — so we let the form
  // post the unprocessed pair and combine here.
  const scopeKind = ((formData.get("scope_kind") as string) || "").trim();
  const scopeGroupId = ((formData.get("scope_group_id") as string) || "").trim();
  const scopeDepartmentId = (
    (formData.get("scope_department_id") as string) || ""
  ).trim();
  let group_id: string | null = null;
  let department_id: string | null = null;
  if (scopeKind === "group" && scopeGroupId) group_id = scopeGroupId;
  else if (scopeKind === "department" && scopeDepartmentId)
    department_id = scopeDepartmentId;

  if (!title) throw new Error("Title is required");
  if (!purpose) throw new Error("Purpose is required");
  if (!group_id && !department_id) {
    throw new Error("Pick a working group or department for this document");
  }

  // Owner picker: defaults to the current user. Admins and policy_leads
  // may override by posting `scope_owner_id`; everyone else has the
  // field locked client-side and we silently ignore any spoofed value.
  const requestedOwnerId = (
    (formData.get("scope_owner_id") as string) || ""
  ).trim();
  let owner_id = user.id;
  if (requestedOwnerId && requestedOwnerId !== user.id) {
    const { data: me } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string }>();
    const canAssign =
      me?.role === "admin" ||
      me?.role === "policy_lead" ||
      me?.role === "policy_lead_department";
    if (canAssign) owner_id = requestedOwnerId;
  }

  // Validate required custom metadata fields
  const { data: requiredFields } = await db
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
    const { data: existing } = await db
      .from("documents")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    i += 1;
    slug = `${baseSlug}-${i}`;
  }

  const { data: doc, error } = await db
    .from("documents")
    .insert({
      title,
      slug,
      document_type,
      language,
      purpose,
      tags,
      owner_id,
      current_content: content,
      // current_version stays at 0 until the first approval. Under the
      // autosave-first model, V1 is the first admin/lead sign-off — not
      // the "save count". A fresh draft has no version yet by design.
      current_version: 0,
      citations_enabled,
      // The XOR check on documents (migration 015) requires exactly
      // one of these to be non-null. The form-side parser above
      // guarantees that.
      group_id,
      department_id,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Save custom metadata values
  const { data: allFields } = await db
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
    await db.from("document_metadata_values").insert(metaRows);
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
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await db
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

  const { data: doc } = await db
    .from("documents")
    .select("hidden_versions")
    .eq("id", documentId)
    .maybeSingle();
  const hidden = new Set<number>(doc?.hidden_versions ?? []);
  if (hidden.has(versionNumber)) hidden.delete(versionNumber);
  else hidden.add(versionNumber);
  const arr = Array.from(hidden).sort((a, b) => a - b);
  const { error } = await db
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

/**
 * Autosave a draft. Lightweight UPDATE only — no version row, no audit
 * entry, no email. Called by the editor on a debounced timer (~1.5s
 * after last keystroke) so the working copy on the server tracks
 * what's in the browser without flooding the version history.
 *
 * Hard-locked when status='review' or 'approved': we already lock the
 * editor UI client-side, but defense in depth — we mirror the same
 * rule here so a stale tab can't accidentally overwrite a frozen
 * snapshot via this endpoint.
 *
 * Versions (V1, V2, V3, …) are minted **only** at approval time by
 * `updateStatus(status='approved')`. That's what makes them feel
 * "official" — a version exists exactly when an admin/lead has signed
 * off on it. Use `saveNewVersion` only for legacy explicit-save flows
 * (e.g. importing a document) where we want a single audit trail row;
 * the editor itself no longer calls it on the typing path.
 */
export async function autosaveDraft(
  documentId: string,
  data: { title: string; content: string }
): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Bail out if the doc is locked. We don't surface this as a user
  // error because the UI already shows the lock state — the autosave
  // just no-ops silently.
  const { data: doc } = await db
    .from("documents")
    .select("status")
    .eq("id", documentId)
    .maybeSingle<{ status: DocStatus }>();
  if (doc?.status === "review") {
    return { ok: false, error: "Document is locked under review." };
  }
  if (doc?.status === "archived") {
    return { ok: false, error: "Document is archived." };
  }

  // RLS handles the auth check (only users with edit-rights can update
  // current_content). If RLS rejects the update we just return ok=false
  // and the editor won't show "Saved" — same UX as a network blip.
  const { error } = await db
    .from("documents")
    .update({ title: data.title, current_content: data.content })
    .eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  // Deliberately no revalidatePath here: re-rendering the whole page on
  // every autosave defeats the point. Other tabs see the change via
  // Hocuspocus realtime broadcast already.
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function saveNewVersion(
  documentId: string,
  data: { title: string; content: string; change_summary: string }
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: doc, error: fetchErr } = await db
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

  const { error: insertErr } = await db.from("document_versions").insert({
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

  const { error: updateErr } = await db
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
      const { data: admins } = await db
        .from("profiles")
        .select("email,full_name")
        .eq("role", "admin");
      const { data: editor } = await db
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

export async function updateStatus(
  documentId: string,
  status: DocStatus,
  options?: { changeSummary?: string }
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false as const, error: "Not authenticated." };

  const { data: me } = await db
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

  // Fetch current state — needed to gate transitions out of `approved`.
  const { data: existingDoc } = await db
    .from("documents")
    .select("status,owner_id")
    .eq("id", documentId)
    .maybeSingle<{ status: DocStatus; owner_id: string | null }>();
  const isOwner = existingDoc?.owner_id === user.id;

  // Workflow gates (defense in depth — UI also hides the buttons):
  // - approve requires canApproveThisDoc.
  // - archive: admin only.
  // - re-open from approved (status flipping back to 'draft' or 'review'):
  //   admin / owner / scoped policy_lead. Plain editors can collaborate
  //   but can't take a published doc off the lock.
  // - everything else (draft/review transitions on non-approved docs):
  //   editor / policy_lead / admin / owner.
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
  } else if (existingDoc?.status === "approved") {
    // Re-opening an approved doc: tighter gate.
    if (!(canApproveThisDoc || isOwner)) {
      return {
        ok: false as const,
        error:
          "Only the document owner or an approver can re-open an approved document for editing.",
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
    // No version row gets created at "send to review" time. The doc is
    // locked via `doc_editable` while status='review' so current_content
    // can't drift; reviewers read exactly what's already on disk.
    // Versions only get minted on `approved` — that's the single moment
    // when V1, V2, V3, … become official, so the audit trail equals the
    // history of admin/lead sign-offs.
    //
    // We do stash the proposed change summary on the doc so the
    // approver sees it in their decision context. It survives a reject
    // (gets cleared on draft transition).
    if (options?.changeSummary?.trim()) {
      patch.pending_change_summary = options.changeSummary.trim();
    }
  }

  if (status === "approved") {
    patch.approved_at = new Date().toISOString();
    // Mint a new official version. Number = (max existing) + 1, so V1
    // is the first-ever approval, V2 the second, etc. The audit log
    // and history pages key off these rows.
    const { data: existing } = await db
      .from("document_versions")
      .select("version_number")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false })
      .limit(1);
    const maxExisting =
      Array.isArray(existing) && existing[0]?.version_number
        ? Number(existing[0].version_number)
        : 0;
    const nextVersion = maxExisting + 1;

    // Snapshot current_content into a new version row. Title goes along
    // for the ride so a future title change doesn't retroactively
    // rewrite history.
    const { data: live } = await db
      .from("documents")
      .select("title,current_content,pending_change_summary")
      .eq("id", documentId)
      .maybeSingle<{
        title: string;
        current_content: string;
        pending_change_summary: string | null;
      }>();
    if (live) {
      const summary =
        options?.changeSummary?.trim() ||
        live.pending_change_summary?.trim() ||
        null;
      const { error: insErr } = await db
        .from("document_versions")
        .insert({
          document_id: documentId,
          version_number: nextVersion,
          title: live.title,
          content: live.current_content,
          change_summary: summary,
          author_id: user.id,
        });
      if (insErr) {
        return { ok: false as const, error: insErr.message };
      }
    }
    patch.approved_version_number = nextVersion;
    patch.current_version = nextVersion;
    patch.review_version_number = null;
    patch.pending_change_summary = null;
  }

  if (status === "draft") {
    // Going back to draft (e.g. after a reject, or "re-open for edit"
    // on an approved doc) clears the pending review snapshot + the
    // proposed change summary. Editors iterate freely again.
    patch.review_version_number = null;
    patch.pending_change_summary = null;
  }

  const { error } = await db
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
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await db
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

  const { data: cur } = await db
    .from("documents")
    .select("current_version,status")
    .eq("id", documentId)
    .maybeSingle();
  if (!cur) return { ok: false, error: "Document not found." };

  const { error } = await db
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
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await db
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

  const { data: doc } = await db
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

  const { data: snap } = await db
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
  await db.from("document_versions").insert({
    document_id: documentId,
    version_number: nextVersion,
    title: snap.title,
    content: snap.content,
    change_summary: `Reverted to v${doc.approved_version_number} (admin rejected pending changes${
      reason ? `: ${reason}` : ""
    })`,
    author_id: user.id,
  });

  const { error } = await db
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
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: v, error } = await db
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
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await db.from("comments").insert({
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

/**
 * Permanently delete a document. Only admin / doc owner / can_approve.
 * The DB-level RLS policy `documents_delete` enforces the same gate
 * server-side; this action layers a "type the title to confirm" check
 * on top so a misclick can't nuke a doc.
 *
 * Cascade behavior: every child table referencing documents.id has
 * ON DELETE CASCADE, so versions, translations, comments, amendments,
 * permissions, metadata, embeddings, discussions, citations, and
 * edit-rights requests all go with the doc. Audit log entries stay —
 * they reference entity_id as a string and document the deletion.
 */
export async function deleteDocument(
  documentId: string,
  confirmation: { typedTitle: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: doc } = await db
    .from("documents")
    .select("id,title,owner_id")
    .eq("id", documentId)
    .maybeSingle<{ id: string; title: string; owner_id: string | null }>();
  if (!doc) return { ok: false, error: "Document not found" };

  // Type-to-confirm: must match exactly (after whitespace normalize).
  // Same UX as GitHub repo deletion / Linear project deletion. Strong
  // enough to block accidental clicks; not a password (we don't have
  // a local password, OIDC owns identity).
  const typed = (confirmation.typedTitle ?? "").trim();
  if (typed !== doc.title.trim()) {
    return {
      ok: false,
      error:
        "Confirmation text doesn't match the document title. Type it exactly to delete.",
    };
  }

  // Authorization: admin / owner / scoped policy_lead. Mirrors the RLS
  // policy in migration 010 — defense in depth so we return a clear
  // error instead of "0 rows deleted".
  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string | null }>();
  const isAdmin = me?.role === "admin";
  const isOwner = doc.owner_id === user.id;
  const canApprove = await canApproveDoc(documentId);
  if (!isAdmin && !isOwner && !canApprove) {
    return {
      ok: false,
      error:
        "Only the document owner, an admin or a scoped policy lead can delete this document.",
    };
  }

  // Audit BEFORE the delete so the entry survives the cascade. We log
  // entity_id as the doc UUID + title so the row is meaningful even
  // after the documents row is gone.
  await logAudit("document.deleted", "document", documentId, {
    title: doc.title,
    deleted_by: user.id,
  });

  const { error } = await db
    .from("documents")
    .delete()
    .eq("id", documentId);
  if (error) return { ok: false, error: error.message };

  // Refresh the listing surfaces. The deleted doc-page itself returns
  // a 404 next render, which is correct.
  revalidatePath("/documents");
  revalidatePath("/library");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function resolveComment(commentId: string, resolved: boolean) {
  const db = await createClient();
  const { error } = await db
    .from("comments")
    .update({ resolved })
    .eq("id", commentId);
  if (error) throw error;
  return { ok: true };
}
