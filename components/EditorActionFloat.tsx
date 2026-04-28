"use client";

/**
 * Vertical icon strip floating beside the paper, in the canvas margin.
 *
 * Mimics Google Docs' "smart action affordances": three small floating
 * buttons sitting in the right gutter that surface the most common
 * doc-side actions without taking permanent panel real estate.
 *
 * Buttons here:
 *   1. 💬+   — focuses the comments panel + scrolls the comment input
 *              into view, ready to type a general comment.
 *   2. 😊    — emoji reaction (placeholder; future feature). Shown
 *              greyed-out for now so the affordance exists in the UI.
 *   3. ✏️    — toggle the AI assistant panel. Closing it gives the
 *              user a wider quiet workspace.
 *
 * Sticky positioning (top-24) so the strip travels with the user as
 * they scroll the document. Hidden in print + on narrow viewports.
 */
export interface EditorActionFloatLabels {
  addComment: string;
  reactWithEmoji: string;
  toggleAi: string;
}

export default function EditorActionFloat({
  onAddComment,
  onToggleAi,
  aiOpen,
  labels,
}: {
  onAddComment: () => void;
  onToggleAi: () => void;
  aiOpen: boolean;
  labels: EditorActionFloatLabels;
}) {
  return (
    <div
      className="sticky top-24 hidden self-start lg:flex print:hidden"
      aria-label="Document actions"
    >
      <div className="flex flex-col gap-2 rounded-full border border-slate-200 bg-white/90 px-1 py-2 shadow-sm backdrop-blur">
        {/* Add comment */}
        <button
          type="button"
          onClick={onAddComment}
          aria-label={labels.addComment}
          title={labels.addComment}
          className="rounded-full p-2 text-slate-600 hover:bg-volt-50 hover:text-volt-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
        </button>

        {/* Emoji reaction (placeholder — disabled). Kept visible as a
            visual cue so the cluster matches Google Docs' three-icon
            shape; clicking does nothing yet. */}
        <button
          type="button"
          disabled
          aria-label={labels.reactWithEmoji}
          title={labels.reactWithEmoji}
          className="rounded-full p-2 text-slate-300"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        {/* Toggle AI panel */}
        <button
          type="button"
          onClick={onToggleAi}
          aria-label={labels.toggleAi}
          aria-pressed={aiOpen}
          title={labels.toggleAi}
          className={`rounded-full p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt-500 ${
            aiOpen
              ? "bg-volt-100 text-volt-700"
              : "text-slate-600 hover:bg-volt-50 hover:text-volt-700"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
