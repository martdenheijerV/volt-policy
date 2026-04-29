"use client";

import { useEffect, useRef, useState } from "react";
import AIPanel, { type AIPanelLabels } from "./AIPanel";

/**
 * 🤖 AI assistant button for the editor toolbar.
 *
 * Click → opens a popover anchored to the button containing the same
 * three sections AIPanel exposes (Similar documents / Grammar /
 * Reading level). Closes on outside-click + Escape. Doesn't take
 * permanent space in the layout — only opens when invoked.
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
          Sparkles icon (the standard mark for "AI assistant" across
          GitHub Copilot, Notion AI, Google Docs Help me write, etc).
          Inline SVG instead of the previous 🤖 emoji because emoji
          rendering is inconsistent across OSes/fonts and was showing
          as an empty box for some users. Two stars: a large 4-pointed
          star + a small one — the visual shorthand for "magic / AI".
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
          className="absolute right-0 top-full z-30 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-4 shadow-xl"
        >
          {/*
            We render AIPanel inside the popover. Its outer <details>
            element is forced open via [open] attribute below so the
            sections are visible immediately when this popover opens.
          */}
          <div data-popover-ai-panel>
            <AIPanel
              documentId={documentId}
              contentHtml={contentHtml}
              language={language}
              labels={labels}
            />
          </div>
          <style jsx>{`
            div[data-popover-ai-panel] :global(details) {
              border: none;
              box-shadow: none;
              padding: 0;
              background: transparent;
            }
            div[data-popover-ai-panel] :global(details > summary) {
              display: none;
            }
            div[data-popover-ai-panel] :global(details > div) {
              margin-top: 0;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
