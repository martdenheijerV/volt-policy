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
        title={labels.heading}
        className={`rounded px-2 py-1 text-sm hover:bg-slate-100 ${
          open ? "bg-slate-900 text-white hover:bg-slate-900" : ""
        }`}
      >
        🤖
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
