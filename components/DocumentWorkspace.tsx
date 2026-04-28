"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import RichTextEditor, { type RichTextEditorHandle } from "./RichTextEditor";
import CommentsPanel, {
  type CommentsPanelHandle,
  type CommentsPanelLabels,
} from "./CommentsPanel";
import AIPanel, { type AIPanelLabels } from "./AIPanel";
import { autosaveDraft, updateStatus } from "@/app/(app)/documents/actions";
import { contentToHtml, sanitizeHtml } from "@/lib/sanitize";
import type { AnchorSpec } from "./AnchorHighlights";
import type { Comment, DocStatus, UserRole } from "@/lib/types";

function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const palette = [
    "#7d3ec0", "#dc2626", "#ea580c", "#ca8a04", "#16a34a",
    "#0891b2", "#2563eb", "#7c3aed", "#db2777", "#0d9488",
  ];
  return palette[Math.abs(h) % palette.length];
}

export interface DocumentWorkspaceLabels {
  edit: string;
  preview: string;
  title: string;
  /** Section heading for the auto-saved indicator. */
  autosaveLabel: string;
  /** "Saving…" while the autosave POST is in flight. */
  autosaving: string;
  /** "Saved a moment ago" when up-to-date. */
  autosavedJustNow: string;
  /** Template "Saved at {time}" — {time} replaced client-side. */
  autosavedAtTpl: string;
  /** "Failed to save" when the autosave call returned an error. */
  autosaveFailed: string;
  /** Heading for the change-summary input that travels with send-to-review. */
  changeSummary: string;
  changeSummaryHint: string;
  changeSummaryHintRequired: string;
  sendToReview: string;
  /** Confirmation prompt shown before flipping a doc to status='review'. */
  confirmSendToReview: string;
  approve: string;
  reject: string;
  /** Label on the button that flips an approved doc back to status='draft'. */
  reopenForEdit: string;
  archive: string;
  awaitingApproval: string;
  /**
   * Template "{name} set status to {status}." — used in the toast that
   * pops up when another connected user changes the doc status.
   */
  remoteStatusTpl: string;
  required: string;
  changeSummaryRequired: string;
  /** Template "Approved as v{n}." — {n} is replaced client-side. */
  approvedAsVersionTpl: string;
  /** Template "Status set to {status}." — {status} is replaced client-side. */
  statusSetToTpl: string;
  failedToUpdateStatus: string;
  status: Record<DocStatus, string>;
}

export default function DocumentWorkspace({
  documentId,
  initialTitle,
  initialContent,
  currentVersion,
  canEdit,
  status,
  language,
  comments,
  currentUserId,
  currentUserName,
  userRole,
  realtimeUrl,
  realtimeToken,
  canApproveThisDoc,
  canSendToReviewThisDoc,
  labels,
  commentsLabels,
  aiLabels,
}: {
  documentId: string;
  initialTitle: string;
  initialContent: string;
  currentVersion: number;
  canEdit: boolean;
  status: DocStatus;
  language: string;
  comments: Comment[];
  currentUserId: string | null;
  currentUserName?: string | null;
  userRole: UserRole | null;
  realtimeUrl?: string | null;
  realtimeToken?: string | null;
  /**
   * True if the current user can approve THIS document. Server-side
   * resolution: admin always; policy_lead only if a group they're in
   * has can_approve=true matching this doc's type/status.
   */
  canApproveThisDoc: boolean;
  /**
   * True if the current user is allowed to flip this doc to status='review'.
   * Equivalent to "owner of the workflow" — admin, doc owner, or scoped
   * policy_lead. Plain co-editors can edit but not lock.
   */
  canSendToReviewThisDoc: boolean;
  labels: DocumentWorkspaceLabels;
  commentsLabels: CommentsPanelLabels;
  aiLabels: AIPanelLabels;
}) {
  // Role-based capability flags (mirrors server-side guards in actions.ts).
  // - Admin: governance — approve all docs, archive, manage.
  // - Editor: create + edit + send to review. Cannot approve by role alone.
  // - Policy lead: edit + send to review + approve docs scoped to their
  //   group via group_doc_permissions.can_approve. The server already
  //   resolved that into `canApproveThisDoc`.
  // - Member/Translator: read + comment + propose amendments only.
  const isAdmin = userRole === "admin";
  const canApprove = canApproveThisDoc;
  const canSendToReview = canSendToReviewThisDoc;
  const canArchive = isAdmin;
  const router = useRouter();
  const [remoteToast, setRemoteToast] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const initialHtml = useMemo(() => contentToHtml(initialContent), [initialContent]);
  const [contentHtml, setContentHtml] = useState(initialHtml);
  const [savedHtml, setSavedHtml] = useState(initialHtml);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [, setSelectedText] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Autosave state. `lastSavedAt` is the server-confirmed moment; we use
  // it to render "Saved a few seconds ago" without spamming re-renders.
  const [autosaveState, setAutosaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const commentsRef = useRef<CommentsPanelHandle>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const dirty = title !== savedTitle || contentHtml !== savedHtml;

  /*
    Debounced autosave. Triggers ~1.5s after the user stops typing
    (or changes the title). Only fires while:
      * canEdit is true (the editor is unlocked)
      * the doc is in 'draft' (we never autosave to a locked status)
      * something is actually dirty
    Cleanup cancels in-flight timers on unmount or before re-firing,
    so a fast typer doesn't stack 50 server roundtrips.
  */
  useEffect(() => {
    if (!canEdit) return;
    if (status !== "draft") return;
    if (!dirty) return;
    const handle = setTimeout(async () => {
      setAutosaveState("saving");
      try {
        const res = await autosaveDraft(documentId, {
          title,
          content: contentHtml,
        });
        if (!res.ok) {
          setAutosaveState("error");
          return;
        }
        setSavedTitle(title);
        setSavedHtml(contentHtml);
        setLastSavedAt(new Date(res.savedAt));
        setAutosaveState("saved");
      } catch {
        setAutosaveState("error");
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [canEdit, status, dirty, title, contentHtml, documentId]);

  // Anchor specs derived from comments — passed to the editor for highlighting.
  const anchors: AnchorSpec[] = useMemo(
    () =>
      comments
        .filter((c) => !c.resolved && c.anchor_quote)
        .map((c) => ({ id: c.id, quote: c.anchor_quote as string })),
    [comments]
  );

  const handleCommentRequest = useCallback((text: string) => {
    commentsRef.current?.startComment(text);
  }, []);

  const handleAnchorClick = useCallback(
    (commentId: string) => {
      setActiveCommentId(commentId);
      // Always switch to edit mode where the editor (and anchor decorations) live.
      if (view !== "edit") setView("edit");
      // Defer to allow the editor to mount before scrolling.
      requestAnimationFrame(() => {
        editorRef.current?.scrollToAnchor(commentId);
      });
    },
    [view]
  );

  // Reverse direction: clicking highlighted text in the doc focuses the comment.
  const handleAnchorClickInDoc = useCallback((commentId: string) => {
    setActiveCommentId(commentId);
    requestAnimationFrame(() => {
      commentsRef.current?.focusComment(commentId);
    });
  }, []);

  /*
    Status changes (send-to-review / approve / reject / archive). The
    change_summary input only matters when going to 'review' or 'approved' —
    we forward it to the server so the approver sees it / it lands on
    the new version row at approval time. For other transitions we
    silently ignore whatever's typed.
  */
  function handleStatus(next: DocStatus) {
    if (next === "review") {
      const ok = window.confirm(labels.confirmSendToReview);
      if (!ok) return;
      if (!changeSummary.trim()) {
        setError(labels.changeSummaryRequired);
        return;
      }
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        // Force-flush any pending autosave before flipping status. This
        // matters most for "send to review": whatever's in the editor
        // right now is what will get locked + (eventually) approved.
        if (next === "review" && dirty) {
          await autosaveDraft(documentId, { title, content: contentHtml });
          setSavedTitle(title);
          setSavedHtml(contentHtml);
        }
        const res = await updateStatus(documentId, next, {
          changeSummary:
            next === "review" || next === "approved"
              ? changeSummary || undefined
              : undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (next === "approved") {
          // Server attached the new version number to the response shape;
          // our typings are loose so we feature-detect.
          const v = (res as { version?: number }).version;
          if (typeof v === "number") {
            setMessage(
              labels.approvedAsVersionTpl.replace("{n}", String(v))
            );
          } else {
            setMessage(
              labels.statusSetToTpl.replace("{status}", labels.status[next])
            );
          }
        } else {
          setMessage(
            labels.statusSetToTpl.replace("{status}", labels.status[next])
          );
        }
        setChangeSummary("");
        // Live broadcast to everyone else in this Hocuspocus room so
        // their UI flips instantly (lock/unlock + toast).
        editorRef.current?.broadcastStatus(next, currentUserName ?? "Someone");
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failedToUpdateStatus);
      }
    });
  }

  // Receive a remote status transition (someone else clicked Send to review
  // / Approve / Reject). Show a toast and trigger a router refresh so
  // canEdit, the banner, and any other status-derived UI re-resolve.
  const handleRemoteStatusChange = useCallback(
    (next: string, byName: string) => {
      const niceStatus =
        labels.status[(next as DocStatus) ?? "draft"] ?? next;
      const tpl = labels.remoteStatusTpl ?? "{name} set status to {status}.";
      setRemoteToast(
        tpl.replace("{name}", byName || "Someone").replace("{status}", niceStatus)
      );
      // Pull the new status + content from the server.
      router.refresh();
    },
    [router, labels.status, labels.remoteStatusTpl]
  );

  // Auto-dismiss the toast after 6s.
  useEffect(() => {
    if (!remoteToast) return;
    const t = setTimeout(() => setRemoteToast(null), 6000);
    return () => clearTimeout(t);
  }, [remoteToast]);

  return (
    <div>
      {remoteToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg print:hidden"
        >
          ⚡ {remoteToast}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("edit")}
              className={`rounded px-3 py-1 text-sm ${
                view === "edit"
                  ? "bg-slate-900 text-white"
                  : "hover:bg-slate-100"
              }`}
              aria-pressed={view === "edit"}
            >
              {labels.edit}
            </button>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={`rounded px-3 py-1 text-sm ${
                view === "preview"
                  ? "bg-slate-900 text-white"
                  : "hover:bg-slate-100"
              }`}
              aria-pressed={view === "preview"}
            >
              {labels.preview}
            </button>
          </div>
          {/*
            Version label. Until the doc has been approved at least once
            we don't show a v0 (which would be misleading: the official
            version numbers start at v1 with the first approval).
            Instead we show the live status name so users see "Concept",
            "In review", etc. while a number doesn't exist yet.
          */}
          <span className="text-sm text-slate-500">
            {currentVersion > 0 ? `v${currentVersion}` : labels.status[status]}
          </span>
        </div>

        {/* Editor stays mounted across view toggles to preserve cursor + content */}
        <div className={view === "edit" ? "" : "hidden"}>
          <div className="px-6 pt-6">
            {/*
              No visible "TITLE" label — modern editors (Google Docs,
              Notion, Linear) just use the input itself as the title row.
              The visually-hidden label keeps screen readers happy.
            */}
            <label htmlFor="doc-title" className="sr-only">
              {labels.title}
            </label>
            <input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              placeholder={labels.title}
              className="w-full border-0 px-0 py-1 text-4xl font-bold tracking-tight placeholder:text-slate-300 focus:outline-none focus:ring-0 disabled:bg-transparent"
            />
          </div>

          <RichTextEditor
            ref={editorRef}
            initialContent={initialContent}
            editable={canEdit}
            anchors={anchors}
            onChange={setContentHtml}
            onSelectionText={setSelectedText}
            onCommentRequest={handleCommentRequest}
            onAnchorClickInDoc={handleAnchorClickInDoc}
            onRemoteStatusChange={handleRemoteStatusChange}
            realtime={
              realtimeUrl && realtimeToken && currentUserId && currentUserName
                ? {
                    url: realtimeUrl,
                    documentId,
                    token: realtimeToken,
                    user: {
                      name: currentUserName,
                      color: colorFromString(currentUserId),
                    },
                  }
                : null
            }
          />

          {/*
            Action bar visibility split from canEdit so approvers (admin /
            policy_lead) can still see Approve/Reject during status='review'
            even though the editor itself is locked.
          */}
          {(canEdit || canApprove || canArchive) && (
            <div className="border-t px-5 py-4">
              {/*
                Autosave status indicator. Replaces the old
                "Save new version" button — the editor saves continuously
                in the background, no manual click needed. The
                change-summary input only appears next to the
                "Send to review" button (where it actually matters,
                because that's the moment the version becomes official).
              */}
              {canEdit && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-4 text-xs text-slate-500"
                >
                  <span className="mr-1 font-medium">{labels.autosaveLabel}:</span>
                  {autosaveState === "saving" && (
                    <span>{labels.autosaving}</span>
                  )}
                  {autosaveState === "saved" && lastSavedAt && (
                    <span>
                      {labels.autosavedAtTpl.replace(
                        "{time}",
                        lastSavedAt.toLocaleTimeString()
                      )}
                    </span>
                  )}
                  {autosaveState === "saved" && !lastSavedAt && (
                    <span>{labels.autosavedJustNow}</span>
                  )}
                  {autosaveState === "idle" && !dirty && (
                    <span>{labels.autosavedJustNow}</span>
                  )}
                  {autosaveState === "idle" && dirty && (
                    <span>{labels.autosaving}</span>
                  )}
                  {autosaveState === "error" && (
                    <span className="text-red-700">
                      ⚠ {labels.autosaveFailed}
                    </span>
                  )}
                </div>
              )}

              {/*
                Change summary lives next to send-to-review because
                that's when it matters: the editor is telling the
                approver "here's what changed and why". The string ends
                up on the version row at approval time. Visible whenever
                the Send-to-review button is — i.e. any non-review and
                non-approved status the user can ship forward (draft,
                archived-but-being-revived, etc.). Without this the
                user gets the "summary required" error with no input
                to fill in.
              */}
              {canEdit &&
                status !== "review" &&
                status !== "approved" &&
                canSendToReview && (
                  <div className="mb-3">
                    <label
                      htmlFor="change-summary"
                      className="block text-xs font-medium uppercase tracking-wider text-slate-500"
                    >
                      {labels.changeSummary}
                    </label>
                    <input
                      id="change-summary"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder={labels.changeSummaryHintRequired}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}

              <div className="flex flex-wrap items-center gap-3">
                {status !== "review" && status !== "approved" && canSendToReview && (
                  <button
                    type="button"
                    onClick={() => handleStatus("review")}
                    disabled={pending}
                    className="rounded border border-amber-600 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                  >
                    {labels.sendToReview}
                  </button>
                )}
                {/* Approved docs are locked. Approvers can flip them
                    back to draft to prepare a new version — public
                    keeps seeing the last-approved snapshot in the
                    meantime (see migration 007). */}
                {status === "approved" && canSendToReview && (
                  <button
                    type="button"
                    onClick={() => handleStatus("draft")}
                    disabled={pending}
                    className="rounded border border-slate-500 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    {labels.reopenForEdit}
                  </button>
                )}
                {status === "review" && canApprove && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatus("approved")}
                      disabled={pending}
                      className="rounded border border-green-700 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
                    >
                      {labels.approve}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatus("draft")}
                      disabled={pending}
                      className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50"
                    >
                      {labels.reject}
                    </button>
                  </>
                )}
                {status === "review" && !canApprove && (
                  <span className="text-xs text-slate-500">
                    {labels.awaitingApproval}
                  </span>
                )}
                {status !== "archived" && canArchive && (
                  <button
                    type="button"
                    onClick={() => handleStatus("archived")}
                    disabled={pending}
                    className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    {labels.archive}
                  </button>
                )}
              </div>

              {message && (
                <div
                  role="status"
                  className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800"
                >
                  {message}
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {view === "preview" && (
          <div className="px-8 py-6">
            <h1 className="text-3xl font-bold">{title}</h1>
            <div
              className="prose-doc mt-4"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentHtml) }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <CommentsPanel
          ref={commentsRef}
          documentId={documentId}
          comments={comments}
          currentUserId={currentUserId}
          activeCommentId={activeCommentId}
          onAnchorClick={handleAnchorClick}
          labels={commentsLabels}
        />
        <AIPanel
          documentId={documentId}
          contentHtml={contentHtml}
          language={language}
          labels={aiLabels}
        />
      </div>
      </div>
    </div>
  );
}
