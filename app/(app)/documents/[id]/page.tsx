import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import DocumentWorkspace from "@/components/DocumentWorkspace";
import MetadataPanel from "@/components/MetadataPanel";
// PendingReviewBanner used to live above the editor; the same content
// has migrated to the bottom-right DocPageToasts (with inline approve/
// reject) so the editor isn't pushed down by a banner.
import { T } from "@/components/T";
import { getT, getTr } from "@/lib/i18n/server";
import { formatDate } from "@/lib/utils";
import { getDocInLanguage } from "@/lib/translate";
import { createRealtimeToken } from "@/lib/realtime/token";
import { canApproveDoc } from "@/lib/db/approval";
import { docTypeLabel } from "@/lib/doc-types";
import {
  listEditRequestsForDoc,
  getMyOpenRequestForDoc,
  getDocParticipants,
} from "@/lib/db/edit-rights";
// EditRightsPanel used to live as a big card below the editor. Replaced
// by DocAccessControls in the page header — the same actions, but
// inside a popover triggered from the people-icon next to the kebab.
import DocAccessControls, {
  type DocAccessControlsLabels,
} from "@/components/DocAccessControls";
import DeleteDocumentButton from "@/components/DeleteDocumentButton";
import type { DeleteDocumentButtonLabels } from "@/components/DeleteDocumentButton";
import DocOverflowMenu, {
  type OverflowItem,
} from "@/components/DocOverflowMenu";
import DocStatusPill from "@/components/DocStatusPill";
import DocPageToasts, {
  type DocPageToastsLabels,
} from "@/components/DocPageToasts";
import type { Comment, Document, Profile } from "@/lib/types";
import type { DocumentWorkspaceLabels } from "@/components/DocumentWorkspace";
import type { CommentsPanelLabels } from "@/components/CommentsPanel";
import type { AIPanelLabels } from "@/components/AIPanel";
import type { MetadataPanelLabels } from "@/components/MetadataPanel";
import type { PendingReviewBannerLabels } from "@/components/PendingReviewBanner";
// ^ kept around because buildPendingReviewLabels still exists for any
//   future surface that wants the old banner shape. Not actively used
//   on this page anymore.

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getT();
  const { tr } = await getTr();
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  const { data: doc } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle<Document & { approved_version_number?: number | null }>();

  if (!doc) notFound();

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user?.id ?? "")
    .maybeSingle<Profile>();

  const { data: comments } = await db
    .from("comments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  const { data: permission } = await db
    .from("document_permissions")
    .select("can_edit")
    .eq("document_id", id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: discussion } = await db
    .from("document_discussions")
    .select("platform,url")
    .eq("document_id", id)
    .maybeSingle();

  const { data: metaFields } = await db
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");
  const applicableFields = (metaFields ?? []).filter(
    (f) => !f.applies_to || f.applies_to === doc.document_type
  );
  const { data: metaValues } = await db
    .from("document_metadata_values")
    .select("field_id,value")
    .eq("document_id", id);
  const metaValuesMap: Record<string, string> = {};
  for (const r of metaValues ?? []) metaValuesMap[r.field_id] = r.value ?? "";

  // Lock-during-review: while a doc is in 'review' status only approvers
  // (admin or scoped policy_lead) may continue editing. Everyone else sees
  // the frozen review snapshot read-only until the admin decides. This is
  // the "ekstratje" the user asked for — clean approval semantics.
  let canApproveThisDoc = profile?.role === "admin";
  if (!canApproveThisDoc && profile?.role === "policy_lead" && user) {
    canApproveThisDoc = await canApproveDoc(doc.id);
  }

  // Suggestion-mode-by-default: as of migration 008, the bare `editor`
  // role no longer gets automatic edit access — they must request it
  // (or an admin pre-grants via document_permissions / group rules).
  // Only admin, doc owner, scoped policy_lead, and explicit doc-perm
  // grants bypass the request flow. This mirrors the new `doc_editable`
  // SQL function exactly, so client and DB agree on who can type.
  const baseEditable =
    !!user &&
    (profile?.role === "admin" ||
      doc.owner_id === user.id ||
      canApproveThisDoc ||
      !!permission?.can_edit);
  // Three-phase workflow:
  //  - draft (concept): everyone with base edit rights can type. Live collab.
  //  - review: NOBODY types. Approvers approve or reject; editors comment.
  //  - approved: locked + publicly visible. To make changes, an approver
  //    clicks "Re-open for editing" which sends it back to draft. The
  //    public layer keeps showing the last-approved snapshot during that
  //    re-edit cycle (see migration 007).
  //  - archived: locked except for admins (who may restore).
  const canEdit =
    doc.status === "review"
      ? false
      : doc.status === "approved"
      ? false
      : doc.status === "archived"
      ? profile?.role === "admin"
      : baseEditable;

  // Who can move the doc into review? Per the user's design (model B):
  // admin always, the document owner (so a single editor can publish their
  // own work), and policy_leads who can approve this specific doc. Plain
  // editors collaborate but don't lock the workflow.
  const isOwner = !!user && doc.owner_id === user.id;
  const canSendToReviewThisDoc =
    profile?.role === "admin" || isOwner || canApproveThisDoc;

  // While status='review', everyone sees the frozen review snapshot
  // (the version that was sent up for approval), NOT the live working
  // copy. This guarantees that what the admin clicks "Approve" on is
  // exactly what they're reading. We fetch the snapshot from
  // document_versions; if it's missing for some reason we fall back to
  // current_content.
  let reviewTitle: string | null = null;
  let reviewContent: string | null = null;
  if (doc.status === "review" && doc.review_version_number) {
    const { data: snap } = await db
      .from("document_versions")
      .select("title,content")
      .eq("document_id", doc.id)
      .eq("version_number", doc.review_version_number)
      .maybeSingle<{ title: string; content: string }>();
    if (snap) {
      reviewTitle = snap.title;
      reviewContent = snap.content;
    }
  }
  const baseTitle = reviewTitle ?? doc.title;
  const baseContent = reviewContent ?? doc.current_content;

  // Auto-translate the doc title + content into the user's preferred
  // language if it differs from the document's source language. Result is
  // cached in `document_translations` so DeepL is hit only once per
  // (doc, version, lang). Editors still always edit the source — the
  // translation is presented as read-only context.
  const userLang = (profile?.language_pref ?? doc.language).toLowerCase();
  const rendered = await getDocInLanguage({
    documentId: doc.id,
    sourceLanguage: doc.language,
    sourceTitle: baseTitle,
    sourceContent: baseContent,
    sourceVersion: doc.review_version_number ?? doc.current_version,
    targetLanguage: userLang,
  });
  // Only when EDITING do we want to keep the original (so the editor isn't
  // editing a translation in another language). For preview / read-only
  // we show the translated version. canEdit users see the translation in
  // a banner with a "view original" link instead.
  const displayTitle = canEdit ? baseTitle : rendered.title;
  const displayContent = canEdit ? baseContent : rendered.content;

  // Edit-rights data: who has access (owner, explicit grants, group
  // members), who's waiting for a decision, and whether the current
  // user has an open request. These hits are cheap (each is a couple
  // of indexed selects) and produce all the data the EditRightsPanel
  // needs without it having to call back into the server.
  const [editRequests, myOpenRequest, participants] = await Promise.all([
    listEditRequestsForDoc(doc.id),
    getMyOpenRequestForDoc(doc.id),
    getDocParticipants(doc.id),
  ]);
  // Approver-side gate: admin OR doc owner OR can_approve_doc. Same as
  // can_decide_edit_request — kept consistent so RLS and UI agree.
  const isApprover =
    profile?.role === "admin" || isOwner || canApproveThisDoc;
  // Only the still-pending requests get the approve/reject buttons.
  // History (approved/rejected/cancelled) lives in the audit log; we
  // could surface it later but for now we keep the panel focused.
  const pendingRequests = editRequests.filter((r) => r.status === "pending");

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
    const { data: pendingVersion } = await db
      .from("document_versions")
      .select("author_id,change_summary")
      .eq("document_id", doc.id)
      .eq("version_number", doc.current_version)
      .maybeSingle<{ author_id: string | null; change_summary: string | null }>();
    pendingChangeSummary = pendingVersion?.change_summary ?? null;
    if (pendingVersion?.author_id) {
      const { data: author } = await db
        .from("profiles")
        .select("full_name")
        .eq("id", pendingVersion.author_id)
        .maybeSingle<{ full_name: string }>();
      pendingAuthorName = author?.full_name ?? null;
    }
  }

  // Build the kebab-menu items: less-frequent links + downloads. Empty
  // arrays / falsy items are filtered so the menu shrinks naturally
  // when a feature is off (e.g. citations not enabled, no discussion link).
  const overflowItems: OverflowItem[] = [
    { kind: "link", label: t("doc.history"), href: `/documents/${doc.id}/history`, icon: "📜" },
    { kind: "link", label: t("doc.amendments"), href: `/documents/${doc.id}/amendments`, icon: "✎" },
    // Citations / Bronnen is now always-on. The `citations_enabled`
    // column on documents stays around for backward compatibility but
    // is no longer consulted for menu visibility — every doc gets the
    // Bronnen tab automatically.
    {
      kind: "link" as const,
      label: t("doc.citations"),
      href: `/documents/${doc.id}/citations`,
      icon: "📚",
    },
    ...(discussion?.url
      ? [
          {
            kind: "link" as const,
            label: t("doc.discussion"),
            href: discussion.url,
            icon: "💬",
            external: true,
          },
        ]
      : canEdit
      ? [
          {
            kind: "link" as const,
            label: await tr("Add discussion link"),
            href: `/documents/${doc.id}/discussion`,
            icon: "💬",
          },
        ]
      : []),
    { kind: "divider" },
    { kind: "download", label: await tr("Download .md"), href: `/api/documents/${doc.id}/export?format=md` },
    { kind: "download", label: await tr("Download .html"), href: `/api/documents/${doc.id}/export?format=html` },
    { kind: "download", label: await tr("Download .docx"), href: `/api/documents/${doc.id}/export?format=docx` },
  ];

  const statusLabel = t(
    doc.status === "draft"
      ? "doc.statusDraft"
      : doc.status === "review"
      ? "doc.statusReview"
      : doc.status === "approved"
      ? "doc.statusApproved"
      : "doc.statusArchived"
  );

  return (
    <div className="w-full">
      {/*
        Header strip — single line with everything content-adjacent. No
        button row, no banners, no purpose-card-block. The kebab on the
        right hides version-history / amendments / discussion /
        citations / downloads behind a single tap so the toolbar stops
        eating vertical space.
      */}
      <div className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 print:hidden">
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          ← <T>All documents</T>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-xs text-slate-500 sm:inline">
            {docTypeLabel(doc.document_type)} · {doc.language.toUpperCase()}
            {doc.current_version > 0 && ` · v${doc.current_version}`}
          </span>
          <DocStatusPill status={doc.status} label={statusLabel} />
          {/*
            Compact access cluster: people indicator (with popover full
            of participants + remove access for approvers + pending
            requests with inline approve/reject) plus the edit-rights
            state button (Request → Pending → Edit access).
          */}
          <DocAccessControls
            documentId={doc.id}
            currentUserId={user?.id ?? null}
            currentUserCanEdit={canEdit}
            isApprover={isApprover}
            myOpenRequest={myOpenRequest}
            pendingRequests={pendingRequests}
            participants={participants}
            labels={await buildAccessControlsLabels(tr)}
          />
          <DocOverflowMenu
            items={overflowItems}
            ariaLabel={await tr("More document actions")}
          />
        </div>
      </div>

      {/*
        Editor — the main event. Everything else on the page is small,
        collapsed, or pushed into toasts so this block dominates the
        viewport. DocumentWorkspace renders title + Tiptap + comments +
        AI side-panel internally.
      */}
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
        canApproveThisDoc={canApproveThisDoc}
        canSendToReviewThisDoc={canSendToReviewThisDoc}
        labels={await buildWorkspaceLabels(tr, t)}
        commentsLabels={await buildCommentsLabels(tr, t, doc.status)}
        aiLabels={await buildAILabels(tr)}
        deleteLabels={
          isApprover
            ? { labels: await buildDeleteLabels(tr), title: doc.title }
            : null
        }
      />

      {/*
        Below the editor: small collapsible accessory cards. All closed
        by default so the editor stays the dominant block. Open them
        when you actually need them.
      */}
      {applicableFields.length > 0 && (
        <div className="mx-auto mt-6 max-w-7xl px-6">
          <MetadataPanel
            documentId={doc.id}
            fields={applicableFields}
            values={metaValuesMap}
            canEdit={canEdit}
            labels={await buildMetadataLabels(tr)}
          />
        </div>
      )}

      {/*
        Toast surface — fixed bottom-right. Replaces the four banners
        that used to live above the editor. Toasts can be dismissed,
        keep their state for the session, and never push the writing
        area down.
      */}
      <DocPageToasts
        documentId={doc.id}
        documentSlug={doc.slug}
        status={doc.status}
        isApprover={isApprover}
        reviewVersionNumber={doc.review_version_number ?? null}
        approvedVersionNumber={doc.approved_version_number ?? null}
        pendingReview={
          hasPendingReview
            ? {
                currentVersion: doc.current_version,
                approvedVersion: doc.approved_version_number!,
                authorName: pendingAuthorName,
                changeSummary: pendingChangeSummary,
              }
            : null
        }
        labels={await buildToastsLabels(tr)}
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
    autosaveLabel,
    autosaving,
    autosavedJustNow,
    autosavedAtTpl,
    autosaveFailed,
    changeSummary,
    changeSummaryHint,
    changeSummaryHintRequired,
    sendToReview,
    confirmSendToReview,
    approve,
    reject,
    reopenForEdit,
    archive,
    awaitingApproval,
    required,
    changeSummaryRequired,
    approvedAsVersionTpl,
    statusSetToTpl,
    failedToUpdateStatus,
    remoteStatusTpl,
  ] = await Promise.all([
    tr("Edit"),
    tr("Preview"),
    tr("Title"),
    tr("Autosave"),
    tr("Saving…"),
    tr("Saved a moment ago"),
    tr("Saved at {time}"),
    tr("Couldn't save — check your connection"),
    tr("Change summary"),
    tr("What did you change and why?"),
    tr("Summary that will travel with this version (will appear in the audit log)"),
    tr("Send to review"),
    tr(
      "Send this document to review? Co-editors will be locked out until an admin approves or rejects. Continue?"
    ),
    tr("Approve"),
    tr("Reject"),
    tr("Re-open for editing"),
    tr("Archive"),
    tr("Awaiting admin approval"),
    tr("Required"),
    tr("A change summary is required before sending a document to review."),
    // {n} and {status} are placeholders we substitute client-side.
    tr("Approved as v{n}."),
    tr("Status set to {status}."),
    tr("Failed to update status."),
    tr("{name} set status to {status}."),
  ]);
  return {
    edit,
    preview,
    title,
    autosaveLabel,
    autosaving,
    autosavedJustNow,
    autosavedAtTpl,
    autosaveFailed,
    changeSummary,
    changeSummaryHint,
    changeSummaryHintRequired,
    sendToReview,
    confirmSendToReview,
    approve,
    reject,
    reopenForEdit,
    archive,
    awaitingApproval,
    required,
    changeSummaryRequired,
    approvedAsVersionTpl,
    statusSetToTpl,
    failedToUpdateStatus,
    remoteStatusTpl,
    status: {
      draft: t("doc.statusDraft"),
      review: t("doc.statusReview"),
      approved: t("doc.statusApproved"),
      archived: t("doc.statusArchived"),
    },
  };
}

async function buildCommentsLabels(
  tr: (s: string) => Promise<string>,
  t: (k: string) => string,
  status: "draft" | "review" | "approved" | "archived"
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
    allCommentsTitle,
    showAllComments,
    showInline,
    noResolved,
  ] = await Promise.all([
    tr("Comments"),
    tr("Sign in to leave a comment."),
    tr("Replying to a comment"),
    tr("Cancel reply"),
    tr("Anchored to"),
    tr("Remove anchor"),
    tr("comments.selectTextHint"),
    tr("Type:"),
    tr("Comment kind"),
    tr("General"),
    tr("Review"),
    tr("Suggestion"),
    tr("Comment body"),
    tr("comments.placeholderReply"),
    tr("comments.placeholderAnchored"),
    tr("comments.placeholderGeneral"),
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
    tr("All comments"),
    tr("Show all comments"),
    tr("Back to inline"),
    tr("No resolved comments."),
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
    allCommentsTitle,
    showAllComments,
    showInline,
    noResolved,
    // Only emit the approved-notice for status='approved'. Other
    // statuses get undefined → CommentsPanel skips the notice block.
    approvedNotice:
      status === "approved" ? t("comments.approvedNotice") : undefined,
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

async function buildDeleteLabels(
  tr: (s: string) => Promise<string>
): Promise<DeleteDocumentButtonLabels> {
  const [
    deleteLbl,
    confirmTitle,
    confirmBodyTpl,
    typedPlaceholderTpl,
    confirmDelete,
    deleting,
    cancel,
    failed,
  ] = await Promise.all([
    tr("Delete document"),
    tr("Delete this document?"),
    tr(
      "This will permanently remove “{title}” and everything attached to it (all versions, comments, amendments, translations, metadata). This cannot be undone."
    ),
    tr("Type {title} to confirm"),
    tr("Permanently delete"),
    tr("Deleting…"),
    tr("Cancel"),
    tr("Couldn't delete the document."),
  ]);
  return {
    delete: deleteLbl,
    confirmTitle,
    confirmBodyTpl,
    typedPlaceholderTpl,
    confirmDelete,
    deleting,
    cancel,
    failed,
  };
}

async function buildAccessControlsLabels(
  tr: (s: string) => Promise<string>
): Promise<DocAccessControlsLabels> {
  const [
    peopleAriaLabel,
    whoHasAccessHeading,
    ownerLabel,
    canEdit,
    canComment,
    canApprove,
    leadLabel,
    viaGroupTpl,
    viaDepartmentTpl,
    revoke,
    promoteToEdit,
    noOtherParticipants,
    pendingRequestsHeading,
    approve,
    reject,
    decisionNotePlaceholder,
    requestEditRights,
    pendingRequest,
    editAccess,
    cancelRequest,
    requestHeading,
    messagePlaceholder,
    submit,
    cancel,
    busy,
    failed,
  ] = await Promise.all([
    tr("Who has access"),
    tr("Who has access"),
    tr("Owner"),
    tr("Edit"),
    tr("Comment"),
    tr("Approve"),
    tr("Lead"),
    tr("via group {name}"),
    tr("via department {name}"),
    tr("Revoke"),
    tr("Grant edit"),
    tr("Only the owner can edit so far."),
    tr("Pending requests"),
    tr("Approve"),
    tr("Reject"),
    tr("Reason (optional, kept in audit log)"),
    tr("Request edit rights"),
    tr("Pending request to edit"),
    tr("Access to edit"),
    tr("Cancel request"),
    tr("Request edit rights"),
    tr("Why do you need edit rights? (optional)"),
    tr("Send request"),
    tr("Cancel"),
    tr("Busy…"),
    tr("Something went wrong."),
  ]);
  return {
    peopleAriaLabel,
    whoHasAccessHeading,
    ownerLabel,
    canEdit,
    canComment,
    canApprove,
    leadLabel,
    viaGroupTpl,
    viaDepartmentTpl,
    revoke,
    promoteToEdit,
    noOtherParticipants,
    pendingRequestsHeading,
    approve,
    reject,
    decisionNotePlaceholder,
    requestEditRights,
    pendingRequest,
    editAccess,
    cancelRequest,
    requestHeading,
    messagePlaceholder,
    submit,
    cancel,
    busy,
    failed,
  };
}

async function buildToastsLabels(
  tr: (s: string) => Promise<string>
): Promise<DocPageToastsLabels> {
  const [
    pendingHeading,
    pendingBodyTpl,
    pendingBodyTplNoAuthor,
    approve,
    reject,
    busy,
    rejectReasonPlaceholder,
    confirmReject,
    cancel,
    viewDiffTpl,
    reviewLockedHeading,
    reviewLockedBodyTpl,
    approverHeading,
    approverBodyTpl,
    dismiss,
  ] = await Promise.all([
    tr("Changes pending approval"),
    tr("v{n} by {author} — public still sees v{m}."),
    tr("v{n} saved — public still sees v{m}."),
    tr("Approve"),
    tr("Reject"),
    tr("Busy…"),
    tr("Why is this rejected? (optional, kept in audit log)"),
    tr("Confirm reject"),
    tr("Cancel"),
    tr("Diff v{from} → v{to}"),
    tr("Under review"),
    tr("An admin is reviewing v{n}. Typing is locked for everyone."),
    tr("Awaiting your approval"),
    tr("You're reading frozen v{n}. Approve to publish or reject."),
    tr("Dismiss"),
  ]);
  return {
    pendingHeading,
    pendingBodyTpl,
    pendingBodyTplNoAuthor,
    approve,
    reject,
    busy,
    rejectReasonPlaceholder,
    confirmReject,
    cancel,
    viewDiffTpl,
    reviewLockedHeading,
    reviewLockedBodyTpl,
    approverHeading,
    approverBodyTpl,
    dismiss,
  };
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
