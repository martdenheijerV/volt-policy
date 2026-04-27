import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import DocumentWorkspace from "@/components/DocumentWorkspace";
import MetadataPanel from "@/components/MetadataPanel";
import PendingReviewBanner from "@/components/PendingReviewBanner";
import { T } from "@/components/T";
import { getT, getTr } from "@/lib/i18n/server";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import { getDocInLanguage } from "@/lib/translate";
import { createRealtimeToken } from "@/lib/realtime/token";
import type { Comment, Document, Profile } from "@/lib/types";
import type { DocumentWorkspaceLabels } from "@/components/DocumentWorkspace";
import type { CommentsPanelLabels } from "@/components/CommentsPanel";
import type { AIPanelLabels } from "@/components/AIPanel";
import type { MetadataPanelLabels } from "@/components/MetadataPanel";
import type { PendingReviewBannerLabels } from "@/components/PendingReviewBanner";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getT();
  const { tr } = await getTr();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle<Document & { approved_version_number?: number | null }>();

  if (!doc) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id ?? "")
    .maybeSingle<Profile>();

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  const { data: permission } = await supabase
    .from("document_permissions")
    .select("can_edit")
    .eq("document_id", id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: discussion } = await supabase
    .from("document_discussions")
    .select("platform,url")
    .eq("document_id", id)
    .maybeSingle();

  const { data: metaFields } = await supabase
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");
  const applicableFields = (metaFields ?? []).filter(
    (f) => !f.applies_to || f.applies_to === doc.document_type
  );
  const { data: metaValues } = await supabase
    .from("document_metadata_values")
    .select("field_id,value")
    .eq("document_id", id);
  const metaValuesMap: Record<string, string> = {};
  for (const r of metaValues ?? []) metaValuesMap[r.field_id] = r.value ?? "";

  const canEdit =
    !!user &&
    (profile?.role === "admin" ||
      profile?.role === "editor" ||
      doc.owner_id === user.id ||
      !!permission?.can_edit);

  // Auto-translate the doc title + content into the user's preferred
  // language if it differs from the document's source language. Result is
  // cached in `document_translations` so DeepL is hit only once per
  // (doc, version, lang). Editors still always edit the source — the
  // translation is presented as read-only context.
  const userLang = (profile?.language_pref ?? doc.language).toLowerCase();
  const rendered = await getDocInLanguage({
    documentId: doc.id,
    sourceLanguage: doc.language,
    sourceTitle: doc.title,
    sourceContent: doc.current_content,
    sourceVersion: doc.current_version,
    targetLanguage: userLang,
  });
  // Only when EDITING do we want to keep the original (so the editor isn't
  // editing a translation in another language). For preview / read-only
  // we show the translated version. canEdit users see the translation in
  // a banner with a "view original" link instead.
  const displayTitle = canEdit ? doc.title : rendered.title;
  const displayContent = canEdit ? doc.current_content : rendered.content;

  // Pending-review state: editor saved a new version on top of an already-
  // approved doc, and the admin hasn't decided yet. Public still sees the
  // previously-approved snapshot.
  const hasPendingReview =
    doc.status === "approved" &&
    typeof doc.approved_version_number === "number" &&
    doc.approved_version_number !== doc.current_version;
  let pendingAuthorName: string | null = null;
  let pendingChangeSummary: string | null = null;
  if (hasPendingReview) {
    const { data: pendingVersion } = await supabase
      .from("document_versions")
      .select("author_id,change_summary")
      .eq("document_id", doc.id)
      .eq("version_number", doc.current_version)
      .maybeSingle<{ author_id: string | null; change_summary: string | null }>();
    pendingChangeSummary = pendingVersion?.change_summary ?? null;
    if (pendingVersion?.author_id) {
      const { data: author } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", pendingVersion.author_id)
        .maybeSingle<{ full_name: string }>();
      pendingAuthorName = author?.full_name ?? null;
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/documents"
          className="text-sm text-slate-500 hover:underline"
        >
          ← <T>All documents</T>
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
              doc.status
            )}`}
          >
            {t(
              doc.status === "draft"
                ? "doc.statusDraft"
                : doc.status === "review"
                ? "doc.statusReview"
                : doc.status === "approved"
                ? "doc.statusApproved"
                : "doc.statusArchived"
            )}
          </span>
          <Link
            href={`/documents/${doc.id}/history`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            {t("doc.history")}
          </Link>
          <Link
            href={`/documents/${doc.id}/amendments`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            {t("doc.amendments")}
          </Link>
          <Link
            href={`/documents/${doc.id}/citations`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            {t("doc.citations")}
          </Link>
          {discussion?.url ? (
            <a
              href={discussion.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-volt-600 px-3 py-1 font-medium text-volt-700 hover:bg-volt-50"
            >
              💬 {t("doc.discussion")}
            </a>
          ) : canEdit ? (
            <Link
              href={`/documents/${doc.id}/discussion`}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
            >
              + <T>Discussion link</T>
            </Link>
          ) : null}
          <a
            href={`/api/documents/${doc.id}/export?format=md`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .md
          </a>
          <a
            href={`/api/documents/${doc.id}/export?format=html`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .html
          </a>
          <a
            href={`/api/documents/${doc.id}/export?format=docx`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .docx
          </a>
        </div>
      </div>

      <div className="mb-2 text-xs text-slate-500 print:hidden">
        {doc.document_type} · {doc.language.toUpperCase()} · updated{" "}
        {formatDate(doc.updated_at)}
        {doc.approved_at && ` · approved ${formatDate(doc.approved_at)}`}
      </div>

      {doc.purpose && (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 print:hidden">
          <span className="font-medium">
            <T>Purpose:</T>
          </span>{" "}
          {doc.purpose}
        </div>
      )}

      {hasPendingReview && profile?.role === "admin" && (
        <PendingReviewBanner
          documentId={doc.id}
          approvedVersion={doc.approved_version_number!}
          currentVersion={doc.current_version}
          pendingAuthorName={pendingAuthorName}
          pendingChangeSummary={pendingChangeSummary}
          labels={await buildPendingReviewLabels(tr)}
        />
      )}
      {hasPendingReview && profile?.role !== "admin" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
          ⏳{" "}
          {(
            await tr(
              "Version v{n} has been saved and is awaiting admin approval. The public still sees v{m}."
            )
          )
            .replace("{n}", String(doc.current_version))
            .replace("{m}", String(doc.approved_version_number))}
        </div>
      )}

      {!rendered.isOriginal && (
        <div className="mb-4 rounded-lg border border-volt-200 bg-volt-50 p-3 text-sm text-volt-900 print:hidden">
          🌐{" "}
          {(
            await tr(
              "Auto-translated from {src} to {dst} via DeepL."
            )
          )
            .replace("{src}", rendered.sourceLanguage.toUpperCase())
            .replace("{dst}", rendered.language.toUpperCase())}
          {" "}
          {canEdit ? (
            <T>
              Editors see the source — change your language preference in the
              nav to see the translation.
            </T>
          ) : (
            <T>
              The original text is authoritative; translations may differ
              slightly.
            </T>
          )}
        </div>
      )}

      {applicableFields.length > 0 && (
        <div className="mb-4">
          <MetadataPanel
            documentId={doc.id}
            fields={applicableFields}
            values={metaValuesMap}
            canEdit={canEdit}
            labels={await buildMetadataLabels(tr)}
          />
        </div>
      )}

      <DocumentWorkspace
        documentId={doc.id}
        initialTitle={displayTitle}
        initialContent={displayContent}
        currentVersion={doc.current_version}
        canEdit={canEdit}
        status={doc.status}
        language={doc.language}
        comments={(comments as Comment[]) ?? []}
        currentUserId={user?.id ?? null}
        currentUserName={profile?.full_name ?? null}
        userRole={profile?.role ?? null}
        realtimeUrl={await getRealtimeUrl()}
        realtimeToken={await getRealtimeToken(user?.id ?? null, doc.id)}
        labels={await buildWorkspaceLabels(tr, t)}
        commentsLabels={await buildCommentsLabels(tr)}
        aiLabels={await buildAILabels(tr)}
      />
    </div>
  );
}

/**
 * Public Hocuspocus URL the browser will open a websocket to.
 * Returns null when realtime is intentionally disabled (e.g. local dev
 * without the realtime container, or when env vars aren't set yet).
 */
async function getRealtimeUrl(): Promise<string | null> {
  return process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? null;
}

/**
 * Mint a per-(user, document) JWT for the realtime collab session. The
 * token is sent to the browser, so we never ship the master HOCUS_SECRET.
 * Returns null when realtime is disabled or the user is anonymous.
 */
async function getRealtimeToken(
  userId: string | null,
  documentId: string
): Promise<string | null> {
  if (!userId) return null;
  if (!process.env.HOCUS_SECRET) return null;
  if (!process.env.NEXT_PUBLIC_HOCUSPOCUS_URL) return null;
  return await createRealtimeToken(userId, documentId);
}

// Pre-translate every UI string the (client) DocumentWorkspace renders.
// Done here on the server so we can hit the DeepL/dict cache once per
// page render instead of marking the whole tree as dynamic on the client.
async function buildWorkspaceLabels(
  tr: (s: string) => Promise<string>,
  t: (k: string) => string
): Promise<DocumentWorkspaceLabels> {
  const [
    edit,
    preview,
    title,
    changeSummary,
    changeSummaryHint,
    changeSummaryHintRequired,
    saveNewVersion,
    saving,
    sendToReview,
    approve,
    archive,
    awaitingApproval,
    required,
    changeSummaryRequired,
    savedAsVersionTpl,
    statusSetToTpl,
    failedToSave,
    failedToUpdateStatus,
  ] = await Promise.all([
    tr("Edit"),
    tr("Preview"),
    tr("Title"),
    tr("Change summary (audit trail)"),
    tr("What did you change and why?"),
    tr("Required: explain what you changed and why"),
    tr("Save new version"),
    tr("Saving…"),
    tr("Send to review"),
    tr("Approve"),
    tr("Archive"),
    tr("Awaiting admin approval"),
    tr("Required"),
    tr("A change summary is required for documents in review or approved status."),
    // {n} and {status} are placeholders we substitute client-side.
    tr("Saved as v{n}."),
    tr("Status set to {status}."),
    tr("Failed to save."),
    tr("Failed to update status."),
  ]);
  return {
    edit,
    preview,
    title,
    changeSummary,
    changeSummaryHint,
    changeSummaryHintRequired,
    saveNewVersion,
    saving,
    sendToReview,
    approve,
    archive,
    awaitingApproval,
    required,
    changeSummaryRequired,
    savedAsVersionTpl,
    statusSetToTpl,
    failedToSave,
    failedToUpdateStatus,
    status: {
      draft: t("doc.statusDraft"),
      review: t("doc.statusReview"),
      approved: t("doc.statusApproved"),
      archived: t("doc.statusArchived"),
    },
  };
}

async function buildCommentsLabels(
  tr: (s: string) => Promise<string>
): Promise<CommentsPanelLabels> {
  const [
    comments,
    signInToComment,
    replyingToComment,
    cancelReply,
    anchoredTo,
    removeAnchor,
    selectTextHint,
    type,
    commentKind,
    kindGeneral,
    kindReview,
    kindSuggestion,
    bodyAria,
    placeholderReply,
    placeholderAnchored,
    placeholderGeneral,
    posting,
    postReply,
    postComment,
    openTpl,
    resolvedTpl,
    noOpen,
    reply,
    resolve,
    reopen,
    clickToJump,
    unknown,
    failedToAdd,
    failedToUpdate,
  ] = await Promise.all([
    tr("Comments"),
    tr("Sign in to leave a comment."),
    tr("Replying to a comment"),
    tr("Cancel reply"),
    tr("Anchored to"),
    tr("Remove anchor"),
    tr("Select text in the editor and click 💬 Comment on selection."),
    tr("Type:"),
    tr("Comment kind"),
    tr("General"),
    tr("Review"),
    tr("Suggestion"),
    tr("Comment body"),
    tr("Type your reply…"),
    tr("What about this passage?"),
    tr("Add a general comment…"),
    tr("Posting…"),
    tr("Post reply"),
    tr("Post comment"),
    tr("Open ({n})"),
    tr("Resolved ({n})"),
    tr("No open comments."),
    tr("Reply"),
    tr("Resolve"),
    tr("Reopen"),
    tr("Click to jump →"),
    tr("Unknown"),
    tr("Failed to add comment."),
    tr("Failed to update."),
  ]);
  return {
    comments,
    signInToComment,
    replyingToComment,
    cancelReply,
    anchoredTo,
    removeAnchor,
    selectTextHint,
    type,
    commentKind,
    kindGeneral,
    kindReview,
    kindSuggestion,
    bodyAria,
    placeholderReply,
    placeholderAnchored,
    placeholderGeneral,
    posting,
    postReply,
    postComment,
    openTpl,
    resolvedTpl,
    noOpen,
    reply,
    resolve,
    reopen,
    clickToJump,
    unknown,
    failedToAdd,
    failedToUpdate,
  };
}

async function buildAILabels(
  tr: (s: string) => Promise<string>
): Promise<AIPanelLabels> {
  const [
    heading,
    similarHeading,
    similarFind,
    grammarHeading,
    grammarCheck,
    cefrHeading,
    cefrAnalyze,
    cefrScoreTpl,
    cefrAvgSentenceTpl,
    cefrLongWordTpl,
    failed,
    ellipsis,
  ] = await Promise.all([
    tr("AI assistant"),
    tr("Similar documents"),
    tr("Find"),
    tr("Grammar & spelling"),
    tr("Check"),
    tr("Reading level (CEFR)"),
    tr("Analyze"),
    tr("(score {n}/100)"),
    tr("Avg sentence length: {n} words"),
    tr("Long-word ratio: {n}%"),
    tr("Failed"),
    tr("…"),
  ]);
  return {
    heading,
    similarHeading,
    similarFind,
    grammarHeading,
    grammarCheck,
    cefrHeading,
    cefrAnalyze,
    cefrScoreTpl,
    cefrAvgSentenceTpl,
    cefrLongWordTpl,
    failed,
    ellipsis,
  };
}

async function buildMetadataLabels(
  tr: (s: string) => Promise<string>
): Promise<MetadataPanelLabels> {
  const [metadata, failed] = await Promise.all([
    tr("Metadata"),
    tr("Failed"),
  ]);
  return { metadata, failed };
}

async function buildPendingReviewLabels(
  tr: (s: string) => Promise<string>
): Promise<PendingReviewBannerLabels> {
  const [
    heading,
    bodyTpl,
    bodyTplNoAuthor,
    changeSummary,
    viewDiffTpl,
    approve,
    reject,
    busy,
    rejectReasonLabel,
    rejectReasonPlaceholder,
    confirmReject,
    cancel,
  ] = await Promise.all([
    tr("Changes pending approval"),
    tr(
      "Version v{n} has been saved by {author}. The public still sees v{m}. Approve to publish, or reject to roll back."
    ),
    tr(
      "Version v{n} has been saved. The public still sees v{m}. Approve to publish, or reject to roll back."
    ),
    tr("Change summary:"),
    tr("View diff (v{from} → v{to})"),
    tr("Approve"),
    tr("Reject"),
    tr("Busy…"),
    tr("Rejection reason (optional — kept in audit log)"),
    tr("E.g. content not correct, or conflicts with policy X"),
    tr("Confirm reject (rolls back)"),
    tr("Cancel"),
  ]);
  return {
    heading,
    bodyTpl,
    bodyTplNoAuthor,
    changeSummary,
    viewDiffTpl,
    approve,
    reject,
    busy,
    rejectReasonLabel,
    rejectReasonPlaceholder,
    confirmReject,
    cancel,
  };
}
