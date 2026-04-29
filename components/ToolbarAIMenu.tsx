"use client";

import { useEffect, useRef, useState } from "react";
import { AIPanelBody, type AIPanelLabels } from "./AIPanel";

/**
 * AI assistant button for the editor toolbar.
 *
 * Click → opens a popover anchored to the button containing the
 * three AI sections (Similar documents / Grammar & spelling /
 * Reading level). Closes on outside-click + Escape. Doesn't take
 * permanent space in the layout — only opens when invoked.
 *
 * Implementation note: the popover renders `AIPanelBody` directly
 * rather than the default-exported `AIPanel`. The default export
 * wraps the body in a `<details>` element which would appear
 * collapsed inside the popover (the trigger summary is hidden by
 * the popover styling, so there'd be no way to expand it) — that's
 * what made the popover look empty in the previous wiring.
 */
export default function ToolbarAIMenu({
  documentId,
  contentHtml,
  language,
  labels,
}: {
  documentId: string;
  contentHtml: string;
  language: string;
  labels: AIPanelLabels;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // Move focus into the popover so keyboard users land on the
    // first action button (Similar / Find). Defer one frame so the
    // dialog has actually mounted.
    requestAnimationFrame(() => firstFocusRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.heading}
        title={labels.heading}
        className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium hover:bg-slate-100 ${
          open ? "bg-volt-600 text-white hover:bg-volt-700" : "text-volt-700"
        }`}
      >
        {/*
          Sparkles icon (standard mark for "AI assistant" across
          GitHub Copilot, Notion AI, Google Docs Help me write, etc).
          Inline SVG instead of an emoji because emoji rendering is
          inconsistent across OSes/fonts.
        */}
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
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
        </svg>
        <span>AI</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={labels.heading}
          className="absolute right-0 top-full z-30 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="text-volt-700"
              >
                <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
                <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
              </svg>
              {labels.heading}
            </div>
            <button
              type="button"
              ref={firstFocusRef}
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <svg
                width="14"
                height="14"
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
          </div>
          <AIPanelBody
            documentId={documentId}
            contentHtml={contentHtml}
            language={language}
            labels={labels}
          />
        </div>
      )}
    </div>
  );
}
