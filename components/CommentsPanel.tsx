"use client";

import {
  forwardRef,
  useEffect,
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
  /**
   * Open the compose form. `anchor` is the selected text (becomes the
   * comment's anchor_quote). `top` is the vertical offset (px,
   * relative to the comments-layer container) at which the compose
   * card should float — passing it makes the card appear next to the
   * selected text instead of at the top of the column.
   */
  startComment: (anchor: string, top?: number) => void;
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
  /** Template "Open ({n})" — {n} is replaced client-side. */
  openTpl: string;
  /** Template "Resolved ({n})" — {n} is replaced client-side. */
  resolvedTpl: string;
  noOpen: string;
  reply: string;
  resolve: string;
  reopen: string;
  clickToJump: string;
  unknown: string;
  failedToAdd: string;
  failedToUpdate: string;
  /**
   * Optional notice rendered at the top of the panel when the doc is
   * approved (locked). Falsy = don't render the notice.
   */
  approvedNotice?: string;
  /**
   * Header on the show-all-comments panel. Optional — falls back to
   * `comments` when not provided so older callers keep working.
   */
  allCommentsTitle?: string;
  /** Tooltip / aria-label on the "expand to full list" toggle. */
  showAllComments?: string;
  /** Tooltip / aria-label on the "back to inline floating cards" toggle. */
  showInline?: string;
  /** Empty state shown in the Resolved tab when there are no resolved comments. */
  noResolved?: string;
}

interface Props {
  documentId: string;
  comments: Comment[];
  currentUserId: string | null;
  activeCommentId?: string | null;
  onAnchorClick?: (commentId: string) => void;
  /**
   * Called after any successful comment mutation (add / resolve / reopen).
   * The parent typically broadcasts a Y.Doc ping so other connected
   * editors refresh their comment list without needing F5.
   */
  onCommentsChanged?: () => void;
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
      onCommentsChanged,
      labels,
    },
    ref
  ) {
    const [body, setBody] = useState("");
    const [anchor, setAnchor] = useState("");
    const [kind] = useState<CommentKind>("general");
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [replyTo, setReplyTo] = useState<string | null>(null);
    // Vertical offset (px relative to comments-layer wrapper) at which
    // the compose card floats. Set by startComment(text, top); cleared
    // when the form closes. null = let the form sit in normal flow
    // (e.g. for replies, which appear inside the parent thread card).
    const [composeTop, setComposeTop] = useState<number | null>(null);
    // View mode: "anchored" = floating cards next to their text in the
    // editor (default); "all" = stacked, scrollable list with tabs for
    // Open/Resolved (Mart's Google-Docs-style sidebar request).
    const [viewMode, setViewMode] = useState<"anchored" | "all">("anchored");
    const [allFilter, setAllFilter] = useState<"open" | "resolved">("open");
    const bodyRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLElement>(null);

    // Per-comment vertical offsets keyed by comment id. Filled in by an
    // effect that:
    //   1. measures each anchor's position in the editor,
    //   2. sorts cards by anchor top,
    //   3. applies gravity — pushes any card down if it would overlap
    //      the previous card, using the actual rendered card heights.
    // Empty map = stack normally (no anchor / not measured yet).
    const [tops, setTops] = useState<Record<string, number>>({});
    useEffect(() => {
      // Anchor mode is the only one where we need to pin cards to
      // measured offsets. In show-all mode cards stack in the natural
      // flex flow of the scrollable list.
      if (viewMode !== "anchored") return;

      function measure() {
        const wrapperBox = wrapperRef.current?.getBoundingClientRect();
        if (!wrapperBox) return;
        // 1. Measure desired anchor tops (where each card *wants* to sit).
        const editorDom = document.querySelector(".paper-body-prose .ProseMirror");
        if (!editorDom) return;
        const seen = new Set<string>();
        const desired: Array<{ id: string; top: number }> = [];
        editorDom
          .querySelectorAll<HTMLElement>("[data-comment-id]")
          .forEach((el) => {
            const id = el.getAttribute("data-comment-id");
            if (!id || seen.has(id)) return;
            seen.add(id);
            const rect = el.getBoundingClientRect();
            desired.push({ id, top: rect.top - wrapperBox.top });
          });

        // 2. Read each card's actual height. Defaults to a sane estimate
        //    when the card hasn't rendered yet (first paint).
        const heights: Record<string, number> = {};
        desired.forEach(({ id }) => {
          const card = wrapperRef.current?.querySelector<HTMLElement>(
            `[data-comment-card="${id}"]`
          );
          heights[id] = card?.offsetHeight ?? 96;
        });

        // 3. Apply gravity: sort by desired top, push down anything that
        //    would overlap. GAP = breathing room between cards.
        const GAP = 8;
        desired.sort((a, b) => a.top - b.top);
        const adjusted: Record<string, number> = {};
        let cursor = 0;
        for (const { id, top } of desired) {
          const finalTop = Math.max(top, cursor);
          adjusted[id] = finalTop;
          cursor = finalTop + (heights[id] ?? 96) + GAP;
        }

        // 4. Skip the state update if nothing meaningful changed
        //    (within 1px). Without this we'd thrash on every scroll.
        setTops((prev) => {
          const sameSize = Object.keys(adjusted).length === Object.keys(prev).length;
          const sameValues =
            sameSize &&
            Object.entries(adjusted).every(
              ([k, v]) => Math.abs((prev[k] ?? -9999) - v) <= 1
            );
          return sameValues ? prev : adjusted;
        });
      }

      // Initial measurement + a follow-up after the next frame so we
      // catch heights of cards that just got re-rendered with new tops.
      measure();
      const rafInitial = requestAnimationFrame(measure);

      let raf = 0;
      function onScroll() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(measure);
      }
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      return () => {
        cancelAnimationFrame(rafInitial);
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      };
    }, [comments, viewMode]);

    useImperativeHandle(ref, () => ({
      startComment(text: string, top?: number) {
        setAnchor(text);
        setReplyTo(null);
        setError(null);
        // Float the compose card next to the selection if a vertical
        // offset was passed; otherwise let it sit in normal flow.
        setComposeTop(top ?? null);
        // If the user is in show-all mode and starts a new anchored
        // comment, flip back to anchored view so the compose card
        // appears next to the text.
        setViewMode("anchored");
        requestAnimationFrame(() => {
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
          setComposeTop(null);
          // kind is fixed at "general" now — no setter needed.
          // Tell other clients to refresh their comment list. The
          // server action's revalidatePath only ever reaches *this*
          // browser; this Y.Doc ping reaches everyone else in the
          // Hocuspocus room.
          onCommentsChanged?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : labels.failedToAdd);
        }
      });
    }

    function toggleResolved(id: string, resolved: boolean) {
      startTransition(async () => {
        try {
          await resolveComment(id, !resolved);
          onCommentsChanged?.();
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

    /*
      Compose form is only shown after the user explicitly invokes
      startComment (via the floating "+" on selection). When idle,
      the panel renders just the anchored comment cards.
    */
    const composeOpen = !!anchor || !!replyTo;

    // Show-all label fallbacks so older translations don't break the
    // build. New strings live in lib/i18n/dictionaries.ts but the
    // component needs to render gracefully if they're missing.
    const allCommentsTitle = labels.allCommentsTitle ?? labels.comments;
    const showAllLabel = labels.showAllComments ?? labels.allCommentsTitle ?? labels.comments;
    const showInlineLabel = labels.showInline ?? labels.comments;
    const noResolvedLabel = labels.noResolved ?? labels.noOpen;

    // ---------- Show-all mode ----------
    if (viewMode === "all") {
      const list = allFilter === "open" ? open : resolved;
      const emptyText = allFilter === "open" ? labels.noOpen : noResolvedLabel;
      return (
        <aside
          ref={wrapperRef}
          className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col rounded-lg border border-slate-200 bg-white shadow-md print:hidden"
          aria-label={allCommentsTitle}
        >
          <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-800">
              {allCommentsTitle}
            </h2>
            <button
              type="button"
              onClick={() => setViewMode("anchored")}
              aria-label={showInlineLabel}
              title={showInlineLabel}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>
          <div
            role="tablist"
            aria-label={allCommentsTitle}
            className="flex border-b border-slate-200 px-3 pt-2 text-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={allFilter === "open"}
              onClick={() => setAllFilter("open")}
              className={`-mb-px border-b-2 px-3 py-2 font-medium transition ${
                allFilter === "open"
                  ? "border-volt-600 text-volt-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {labels.openTpl.replace("{n}", String(open.length))}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={allFilter === "resolved"}
              onClick={() => setAllFilter("resolved")}
              className={`-mb-px border-b-2 px-3 py-2 font-medium transition ${
                allFilter === "resolved"
                  ? "border-volt-600 text-volt-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {labels.resolvedTpl.replace("{n}", String(resolved.length))}
            </button>
          </div>

          {labels.approvedNotice && (
            <p
              role="note"
              className="mx-3 mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800"
            >
              {labels.approvedNotice}
            </p>
          )}

          <div
            className="flex-1 overflow-y-auto px-3 py-3"
            // Independent scroll: the user can wheel through this
            // panel without making the document scroll. The page
            // doesn't scroll because we capture wheel inside this
            // overflowed container (browser default behaviour).
          >
            {list.length === 0 ? (
              <p className="text-sm text-slate-500">{emptyText}</p>
            ) : (
              <ul className={`space-y-3 ${allFilter === "resolved" ? "opacity-70" : ""}`}>
                {list.map((c) => (
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
                    anchorOffset={null}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
      );
    }

    // ---------- Anchored (default) mode ----------
    return (
      <aside
        ref={wrapperRef}
        className="relative bg-transparent print:hidden"
      >
        {/*
          Floating "Show all comments" pill — sits above the first
          floating card. Clicking flips the panel into the scrollable
          tabs view.
        */}
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setViewMode("all")}
            aria-label={showAllLabel}
            title={showAllLabel}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            {showAllLabel}
            {open.length + resolved.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {open.length + resolved.length}
              </span>
            )}
          </button>
        </div>

        {labels.approvedNotice && (
          <p
            role="note"
            className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800"
          >
            {labels.approvedNotice}
          </p>
        )}

        {currentUserId && composeOpen ? (
          <div
            style={
              composeTop !== null
                ? {
                    position: "absolute",
                    top: composeTop,
                    left: 0,
                    right: 0,
                    zIndex: 30,
                  }
                : undefined
            }
            className="mb-4 space-y-2 rounded-lg border bg-white p-3 shadow-md"
          >
            {replyTo ? (
              <div className="flex items-start gap-2 rounded border-l-4 border-slate-400 bg-slate-50 p-2 text-xs">
                <div className="flex-1 italic text-slate-600">
                  {labels.replyingToComment}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(null);
                    setComposeTop(null);
                  }}
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
                  onClick={() => {
                    setAnchor("");
                    setComposeTop(null);
                  }}
                  aria-label={labels.removeAnchor}
                  className="text-volt-700 hover:underline"
                >
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">{labels.selectTextHint}</p>
            )}

            {/*
              Type selector (general / review / suggestion) intentionally
              hidden — comments are now just plain comments. The kind is
              still tracked in the DB (existing rows + new ones default
              to 'general') so we can resurface it later as a quick
              labeling action on individual comments. Mart's request:
              "Dat mogen gewoon de reacties zijn".
            */}

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
        ) : null}

        <div className="mt-1">
          {/* "Open (n)" header removed — anchored cards float at the
              text they refer to, so a count header would be redundant.
              The "Show all comments" pill at the top exposes counts. */}
          {/*
            Position relative so individual comment threads can float
            at their anchor's vertical offset (when anchorOffset is
            non-null). Threads without an anchor stay in normal flow.
            The min-height grows with the editor so absolutely-positioned
            cards always fit somewhere reachable.
          */}
          <ul
            className="relative mt-2 space-y-3"
            style={{ minHeight: 200 }}
          >
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
                anchorOffset={tops[c.id] ?? null}
              />
            ))}
          </ul>
        </div>
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
  anchorOffset,
}: {
  top: Comment;
  replies: Comment[];
  onToggle: (id: string, resolved: boolean) => void;
  currentUserId: string | null;
  isActive?: boolean;
  onAnchorClick?: (commentId: string) => void;
  onReply: (id: string) => void;
  labels: CommentsPanelLabels;
  /** Vertical offset (px) where this comment's anchor sits in the
      editor. When non-null we float the card to that height; when
      null we let it sit in normal flow. */
  anchorOffset: number | null;
}) {
  const hasAnchor = !!top.anchor_quote;
  const handleJump = () => {
    if (hasAnchor && onAnchorClick) onAnchorClick(top.id);
  };

  return (
    <li
      data-comment-card={top.id}
      style={
        anchorOffset !== null
          ? { position: "absolute", top: anchorOffset, left: 0, right: 0 }
          : undefined
      }
      className={[
        "rounded-lg bg-white p-3 text-sm shadow-md transition",
        isActive
          ? "ring-2 ring-volt-500"
          : "border border-slate-200 hover:shadow-lg",
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
