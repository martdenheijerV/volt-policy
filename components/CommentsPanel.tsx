"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { addComment, resolveComment } from "@/app/(app)/documents/actions";
import { formatDate } from "@/lib/utils";
import type { Comment, CommentKind } from "@/lib/types";

export interface CommentsPanelHandle {
  startComment: (anchor: string) => void;
  focusComment: (commentId: string) => void;
}

export interface CommentsPanelLabels {
  comments: string;
  signInToComment: string;
  replyingToComment: string;
  cancelReply: string;
  anchoredTo: string;
  removeAnchor: string;
  selectTextHint: string;
  type: string;
  commentKind: string;
  kindGeneral: string;
  kindReview: string;
  kindSuggestion: string;
  bodyAria: string;
  placeholderReply: string;
  placeholderAnchored: string;
  placeholderGeneral: string;
  posting: string;
  postReply: string;
  postComment: string;
  open: (n: number) => string;
  resolved: (n: number) => string;
  noOpen: string;
  reply: string;
  resolve: string;
  reopen: string;
  clickToJump: string;
  unknown: string;
  failedToAdd: string;
  failedToUpdate: string;
}

interface Props {
  documentId: string;
  comments: Comment[];
  currentUserId: string | null;
  activeCommentId?: string | null;
  onAnchorClick?: (commentId: string) => void;
  labels: CommentsPanelLabels;
}

const CommentsPanel = forwardRef<CommentsPanelHandle, Props>(
  function CommentsPanel(
    {
      documentId,
      comments,
      currentUserId,
      activeCommentId,
      onAnchorClick,
      labels,
    },
    ref
  ) {
    const [body, setBody] = useState("");
    const [anchor, setAnchor] = useState("");
    const [kind, setKind] = useState<CommentKind>("general");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [replyTo, setReplyTo] = useState<string | null>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLElement>(null);

    useImperativeHandle(ref, () => ({
      startComment(text: string) {
        setAnchor(text);
        setReplyTo(null);
        setError(null);
        requestAnimationFrame(() => {
          wrapperRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          bodyRef.current?.focus();
        });
      },
      focusComment(commentId: string) {
        const node = wrapperRef.current?.querySelector<HTMLElement>(
          `[data-comment-card="${commentId}"]`
        );
        node?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }));

    function submit() {
      if (!body.trim()) return;
      setError(null);
      startTransition(async () => {
        try {
          await addComment(
            documentId,
            body.trim(),
            anchor.trim() || null,
            replyTo,
            kind
          );
          setBody("");
          setAnchor("");
          setReplyTo(null);
          setKind("general");
        } catch (e) {
          setError(e instanceof Error ? e.message : labels.failedToAdd);
        }
      });
    }

    function toggleResolved(id: string, resolved: boolean) {
      startTransition(async () => {
        try {
          await resolveComment(id, !resolved);
        } catch (e) {
          setError(e instanceof Error ? e.message : labels.failedToUpdate);
        }
      });
    }

    function startReply(id: string) {
      setReplyTo(id);
      setAnchor("");
      requestAnimationFrame(() => bodyRef.current?.focus());
    }

    // Build a tree: top-level comments and a map of children by parent_id.
    const tree = useMemo(() => {
      const tops = comments.filter((c) => !c.parent_id);
      const byParent = new Map<string, Comment[]>();
      comments
        .filter((c) => c.parent_id)
        .forEach((c) => {
          if (!c.parent_id) return;
          const list = byParent.get(c.parent_id) ?? [];
          list.push(c);
          byParent.set(c.parent_id, list);
        });
      return { tops, byParent };
    }, [comments]);

    const open = tree.tops.filter((c) => !c.resolved);
    const resolved = tree.tops.filter((c) => c.resolved);

    return (
      <aside
        ref={wrapperRef}
        className="rounded-lg border bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto print:hidden"
      >
        <h2 className="text-lg font-semibold">{labels.comments}</h2>

        {currentUserId ? (
          <div className="mt-3 space-y-2">
            {replyTo ? (
              <div className="flex items-start gap-2 rounded border-l-4 border-slate-400 bg-slate-50 p-2 text-xs">
                <div className="flex-1 italic text-slate-600">
                  {labels.replyingToComment}
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  aria-label={labels.cancelReply}
                  className="hover:underline"
                >
                  ✕
                </button>
              </div>
            ) : anchor ? (
              <div className="flex items-start gap-2 rounded border-l-4 border-volt-500 bg-volt-50 p-2 text-xs">
                <div className="flex-1">
                  <div className="font-medium uppercase tracking-wider text-volt-700">
                    {labels.anchoredTo}
                  </div>
                  <div className="mt-1 italic text-slate-700">
                    &ldquo;
                    {anchor.length > 140 ? anchor.slice(0, 140) + "…" : anchor}
                    &rdquo;
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAnchor("")}
                  aria-label={labels.removeAnchor}
                  className="text-volt-700 hover:underline"
                >
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">{labels.selectTextHint}</p>
            )}

            <div className="flex items-center gap-2 text-xs">
              <label className="text-slate-500">{labels.type}</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CommentKind)}
                disabled={!!replyTo}
                className="rounded border border-slate-300 px-2 py-1"
                aria-label={labels.commentKind}
              >
                <option value="general">{labels.kindGeneral}</option>
                <option value="review">{labels.kindReview}</option>
                <option value="suggestion">{labels.kindSuggestion}</option>
              </select>
            </div>

            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder={
                replyTo
                  ? labels.placeholderReply
                  : anchor
                  ? labels.placeholderAnchored
                  : labels.placeholderGeneral
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              aria-label={labels.bodyAria}
            />

            {error && (
              <div role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending || !body.trim()}
              className="rounded bg-volt-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
            >
              {pending
                ? labels.posting
                : replyTo
                ? labels.postReply
                : labels.postComment}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{labels.signInToComment}</p>
        )}

        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {labels.open(open.length)}
          </h3>
          <ul className="mt-2 space-y-3">
            {open.length === 0 && (
              <li className="text-sm text-slate-500">{labels.noOpen}</li>
            )}
            {open.map((c) => (
              <CommentThread
                key={c.id}
                top={c}
                replies={tree.byParent.get(c.id) ?? []}
                onToggle={toggleResolved}
                currentUserId={currentUserId}
                isActive={activeCommentId === c.id}
                onAnchorClick={onAnchorClick}
                onReply={startReply}
                labels={labels}
              />
            ))}
          </ul>
        </div>

        {resolved.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {labels.resolved(resolved.length)}
            </h3>
            <ul className="mt-2 space-y-3 opacity-60">
              {resolved.map((c) => (
                <CommentThread
                  key={c.id}
                  top={c}
                  replies={tree.byParent.get(c.id) ?? []}
                  onToggle={toggleResolved}
                  currentUserId={currentUserId}
                  isActive={activeCommentId === c.id}
                  onAnchorClick={onAnchorClick}
                  onReply={startReply}
                  labels={labels}
                />
              ))}
            </ul>
          </div>
        )}
      </aside>
    );
  }
);

function CommentThread({
  top,
  replies,
  onToggle,
  currentUserId,
  isActive,
  onAnchorClick,
  onReply,
  labels,
}: {
  top: Comment;
  replies: Comment[];
  onToggle: (id: string, resolved: boolean) => void;
  currentUserId: string | null;
  isActive?: boolean;
  onAnchorClick?: (commentId: string) => void;
  onReply: (id: string) => void;
  labels: CommentsPanelLabels;
}) {
  const hasAnchor = !!top.anchor_quote;
  const handleJump = () => {
    if (hasAnchor && onAnchorClick) onAnchorClick(top.id);
  };

  return (
    <li
      data-comment-card={top.id}
      className={[
        "rounded border p-3 text-sm transition",
        isActive
          ? "border-volt-500 bg-volt-50 shadow-sm ring-2 ring-volt-200"
          : "border-slate-200 bg-slate-50 hover:border-slate-300",
        hasAnchor && onAnchorClick ? "cursor-pointer" : "",
      ].join(" ")}
      onClick={hasAnchor ? handleJump : undefined}
      onKeyDown={(e) => {
        if (!hasAnchor || !onAnchorClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleJump();
        }
      }}
      role={hasAnchor && onAnchorClick ? "button" : undefined}
      tabIndex={hasAnchor && onAnchorClick ? 0 : -1}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-2">
          <span className="font-medium text-slate-700">
            {top.author_name_cached ?? labels.unknown}
          </span>
          {top.kind && top.kind !== "general" && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                top.kind === "review"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {top.kind === "review" ? labels.kindReview : labels.kindSuggestion}
            </span>
          )}
        </span>
        <span>{formatDate(top.created_at)}</span>
      </div>
      {top.anchor_quote && (
        <div className="mb-2 flex items-center gap-1 border-l-2 border-volt-400 pl-2 text-xs italic text-slate-600">
          <span className="text-volt-700">↪</span>
          &ldquo;
          {top.anchor_quote.length > 140
            ? top.anchor_quote.slice(0, 140) + "…"
            : top.anchor_quote}
          &rdquo;
        </div>
      )}
      <p className="whitespace-pre-wrap text-slate-800">{top.body}</p>

      {replies.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
          {replies.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                  {r.author_name_cached ?? labels.unknown}
                </span>
                <span>{formatDate(r.created_at)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-slate-800">
                {r.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-3 text-xs">
        {currentUserId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReply(top.id);
            }}
            className="font-medium text-volt-700 hover:underline"
          >
            {labels.reply}
          </button>
        )}
        {hasAnchor && onAnchorClick && (
          <span className="font-medium text-slate-500">
            {labels.clickToJump}
          </span>
        )}
        {currentUserId === top.author_id && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(top.id, top.resolved);
            }}
            className="ml-auto text-xs font-medium text-slate-600 hover:underline"
          >
            {top.resolved ? labels.reopen : labels.resolve}
          </button>
        )}
      </div>
    </li>
  );
}

export default CommentsPanel;
