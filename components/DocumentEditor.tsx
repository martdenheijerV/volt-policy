"use client";

import { useState, useTransition } from "react";
import { saveNewVersion, updateStatus } from "@/app/(app)/documents/actions";
import { renderMarkdown } from "@/lib/markdown";
import type { DocStatus } from "@/lib/types";

export default function DocumentEditor({
  documentId,
  initialTitle,
  initialContent,
  currentVersion,
  canEdit,
  status,
}: {
  documentId: string;
  initialTitle: string;
  initialContent: string;
  currentVersion: number;
  canEdit: boolean;
  status: DocStatus;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [changeSummary, setChangeSummary] = useState("");
  const [suggestionMode, setSuggestionMode] = useState(true);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = title !== initialTitle || content !== initialContent;

  function handleSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await saveNewVersion(documentId, {
          title,
          content,
          change_summary: changeSummary,
        });
        setMessage(`Saved as v${res.version}.`);
        setChangeSummary("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save.");
      }
    });
  }

  function handleStatus(next: DocStatus) {
    startTransition(async () => {
      try {
        await updateStatus(documentId, next);
        setMessage(`Status set to ${next}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update status.");
      }
    });
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("edit")}
            className={`rounded px-3 py-1 text-sm ${
              view === "edit" ? "bg-slate-900 text-white" : "hover:bg-slate-100"
            }`}
            aria-pressed={view === "edit"}
          >
            Edit
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
            Preview
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {canEdit && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={suggestionMode}
                onChange={(e) => setSuggestionMode(e.target.checked)}
              />
              Suggestion mode
            </label>
          )}
          <span className="text-slate-500">v{currentVersion}</span>
        </div>
      </div>

      {view === "edit" ? (
        <div className="p-4">
          <label htmlFor="doc-title" className="block text-sm font-medium">
            Title
          </label>
          <input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-lg font-semibold disabled:bg-slate-50"
          />

          <label
            htmlFor="doc-body"
            className="mt-4 block text-sm font-medium"
          >
            Content (Markdown)
          </label>
          <textarea
            id="doc-body"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={22}
            disabled={!canEdit}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-50"
          />

          {canEdit && (
            <>
              <label
                htmlFor="change-summary"
                className="mt-4 block text-sm font-medium"
              >
                Change summary (required motivation for audit trail)
              </label>
              <input
                id="change-summary"
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder={
                  suggestionMode
                    ? "Suggested: briefly describe the proposed change"
                    : "What did you change and why?"
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending || !dirty}
                  className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save new version"}
                </button>
                {status !== "review" && status !== "approved" && (
                  <button
                    type="button"
                    onClick={() => handleStatus("review")}
                    disabled={pending}
                    className="rounded border border-amber-600 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                  >
                    Send to review
                  </button>
                )}
                {status === "review" && (
                  <button
                    type="button"
                    onClick={() => handleStatus("approved")}
                    disabled={pending}
                    className="rounded border border-green-700 px-4 py-2 text-sm font-medium text-green-800 hover:bg-green-50"
                  >
                    Approve
                  </button>
                )}
                {status !== "archived" && (
                  <button
                    type="button"
                    onClick={() => handleStatus("archived")}
                    disabled={pending}
                    className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Archive
                  </button>
                )}
              </div>
            </>
          )}

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
      ) : (
        <div className="p-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          <div
            className="prose-doc mt-4"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        </div>
      )}
    </div>
  );
}
