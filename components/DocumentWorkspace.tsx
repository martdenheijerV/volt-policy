"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import RichTextEditor, { type RichTextEditorHandle } from "./RichTextEditor";
import CommentsPanel, {
  type CommentsPanelHandle,
  type CommentsPanelLabels,
} from "./CommentsPanel";
import AIPanel, { type AIPanelLabels } from "./AIPanel";
import { saveNewVersion, updateStatus } from "@/app/(app)/documents/actions";
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
  changeSummary: string;
  changeSummaryHint: string;
  changeSummaryHintRequired: string;
  saveNewVersion: string;
  saving: string;
  sendToReview: string;
  approve: string;
  archive: string;
  awaitingApproval: string;
  required: string;
  changeSummaryRequired: string;
  /** Template "Saved as v{n}." — {n} is replaced client-side. */
  savedAsVersionTpl: string;
  /** Template "Status set to {status}." — {status} is replaced client-side. */
  statusSetToTpl: string;
  failedToSave: string;
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
  labels: DocumentWorkspaceLabels;
  commentsLabels: CommentsPanelLabels;
  aiLabels: AIPanelLabels;
}) {
  // Role-based capability flags (mirrors server-side guards in actions.ts).
  // - Admin: governance — approve, archive, manage. Can also edit (override).
  // - Editor: create + edit + send to review. Cannot approve.
  // - Member/Translator: read + comment + propose amendments only.
  const isAdmin = userRole === "admin";
  const isEditor = userRole === "editor";
  const canApprove = isAdmin;
  const canSendToReview = isAdmin || isEditor;
  const canArchive = isAdmin;
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
  const commentsRef = useRef<CommentsPanelHandle>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const dirty = title !== savedTitle || contentHtml !== savedHtml;

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

  function handleSave() {
    setError(null);
    setMessage(null);
    // Mirror the server-side guard so the user gets a clear inline message
    // instead of Next.js's generic "Server Components render" error page.
    if (
      (status === "review" || status === "approved") &&
      !changeSummary.trim()
    ) {
      setError(labels.changeSummaryRequired);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveNewVersion(documentId, {
          title,
          content: contentHtml,
          change_summary: changeSummary,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSavedTitle(title);
        setSavedHtml(contentHtml);
        setChangeSummary("");
        setMessage(labels.savedAsVersionTpl.replace("{n}", String(res.version)));
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failedToSave);
      }
    });
  }

  function handleStatus(next: DocStatus) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await updateStatus(documentId, next);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setMessage(
          labels.statusSetToTpl.replace("{status}", labels.status[next])
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failedToUpdateStatus);
      }
    });
  }

  return (
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
          <span className="text-sm text-slate-500">v{currentVersion}</span>
        </div>

        {/* Editor stays mounted across view toggles to preserve cursor + content */}
        <div className={view === "edit" ? "" : "hidden"}>
          <div className="px-5 pt-4">
            <label
              htmlFor="doc-title"
              className="block text-xs font-medium uppercase tracking-wider text-slate-500"
            >
              {labels.title}
            </label>
            <input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="mt-1 w-full border-0 px-0 py-1 text-3xl font-bold focus:outline-none focus:ring-0 disabled:bg-transparent"
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

          {canEdit && (
            <div className="border-t px-5 py-4">
              <label
                htmlFor="change-summary"
                className="block text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                {labels.changeSummary}
                {(status === "review" || status === "approved") && (
                  <span className="ml-1 text-red-600" aria-label={labels.required}>
                    *
                  </span>
                )}
              </label>
              <input
                id="change-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                required={status === "review" || status === "approved"}
                aria-required={status === "review" || status === "approved"}
                placeholder={
                  status === "review" || status === "approved"
                    ? labels.changeSummaryHintRequired
                    : labels.changeSummaryHint
                }
                className={`mt-1 w-full rounded border px-3 py-2 text-sm ${
                  (status === "review" || status === "approved") &&
                  !changeSummary.trim()
                    ? "border-red-300 bg-red-50"
                    : "border-slate-300"
                }`}
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending || !dirty}
                  className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
                >
                  {pending ? labels.saving : labels.saveNewVersion}
                </button>
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
                {status === "review" && canApprove && (
                  <button
                    type="button"
                    onClick={() => handleStatus("approved")}
                    disabled={pending}
                    className="rounded border border-green-700 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
                  >
                    {labels.approve}
                  </button>
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
  );
}
