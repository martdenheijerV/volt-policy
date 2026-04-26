"use client";

import { useState, useTransition } from "react";
import { saveTranslation } from "../actions";
import { contentToHtml, sanitizeHtml } from "@/lib/sanitize";

type Status = "machine" | "in_review" | "verified";

export default function TranslationEditor({
  documentId,
  sourceLanguage,
  targetLanguage,
  sourceTitle,
  sourceContent,
  translationTitle,
  translationContent,
  status,
}: {
  documentId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceTitle: string;
  sourceContent: string;
  translationTitle: string;
  translationContent: string;
  status: Status;
}) {
  const [title, setTitle] = useState(translationTitle);
  const [content, setContent] = useState(translationContent);
  const [currentStatus, setCurrentStatus] = useState<Status>(status);
  const [pending, startTransition] = useTransition();
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callDeepL() {
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: contentToHtml(sourceContent),
          target: targetLanguage,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setContent(data.translated);
      if (data.provider === "stub") {
        setMessage(
          "Translation provider not configured (DEEPL_API_KEY). Source copied as-is — please translate manually."
        );
      } else {
        setMessage("Translated via DeepL.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  }

  function save(nextStatus: Status) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await saveTranslation(documentId, targetLanguage, {
          title,
          content,
          status: nextStatus,
        });
        setCurrentStatus(nextStatus);
        setMessage("Saved.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 rounded-t border border-b-0 bg-slate-50 px-4 py-2 text-sm">
        <button
          type="button"
          onClick={callDeepL}
          disabled={translating}
          className="rounded bg-volt-600 px-3 py-1 text-xs font-medium text-white hover:bg-volt-700 disabled:opacity-50"
        >
          {translating ? "Translating…" : "🪄 Translate with DeepL"}
        </button>
        <span className="ml-auto text-slate-600">
          Status:
          <span
            className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${
              currentStatus === "verified"
                ? "bg-green-100 text-green-800"
                : currentStatus === "in_review"
                ? "bg-amber-100 text-amber-800"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {currentStatus}
          </span>
        </span>
        <button
          type="button"
          onClick={() => save("in_review")}
          disabled={pending}
          className="rounded border border-amber-600 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
        >
          Save as in_review
        </button>
        <button
          type="button"
          onClick={() => save("verified")}
          disabled={pending}
          className="rounded border border-green-700 px-3 py-1 text-xs font-medium text-green-800 hover:bg-green-50"
        >
          Save as verified
        </button>
      </div>

      <div className="grid gap-0 rounded-b border lg:grid-cols-2">
        <div className="border-b lg:border-b-0 lg:border-r">
          <div className="border-b bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Source ({sourceLanguage.toUpperCase()})
          </div>
          <div className="bg-white p-4">
            <h2 className="text-xl font-bold">{sourceTitle}</h2>
            <div
              className="prose-doc mt-3 text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentToHtml(sourceContent)) }}
            />
          </div>
        </div>
        <div>
          <div className="border-b bg-slate-50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            Translation ({targetLanguage.toUpperCase()})
          </div>
          <div className="bg-white p-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-xl font-bold"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={20}
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {message && (
        <div role="status" className="mt-3 rounded bg-green-50 p-2 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
