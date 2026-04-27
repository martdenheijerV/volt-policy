"use client";

import { useState } from "react";
import { htmlToText } from "@/lib/diff";

export interface AIPanelLabels {
  heading: string;
  similarHeading: string;
  similarFind: string;
  grammarHeading: string;
  grammarCheck: string;
  cefrHeading: string;
  cefrAnalyze: string;
  cefrScore: (n: number) => string;
  cefrAvgSentence: (n: string) => string;
  cefrLongWord: (n: string) => string;
  failed: string;
  ellipsis: string;
}

export default function AIPanel({
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
  return (
    <details className="rounded-lg border bg-white p-4 shadow-sm print:hidden">
      <summary className="cursor-pointer text-sm font-semibold">
        🤖 {labels.heading}
      </summary>
      <div className="mt-4 space-y-6 text-sm">
        <SimilarDocsSection
          contentHtml={contentHtml}
          documentId={documentId}
          labels={labels}
        />
        <GrammarSection
          contentHtml={contentHtml}
          language={language}
          labels={labels}
        />
        <CefrSection contentHtml={contentHtml} labels={labels} />
      </div>
    </details>
  );
}

function SimilarDocsSection({
  contentHtml,
  documentId,
  labels,
}: {
  contentHtml: string;
  documentId: string;
  labels: AIPanelLabels;
}) {
  const [results, setResults] = useState<
    { id: string; title: string; slug: string; document_type: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const text = htmlToText(contentHtml).slice(0, 500);
      const res = await fetch("/api/ai/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text, excludeId: documentId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{labels.similarHeading}</h3>
        <button
          onClick={run}
          disabled={loading}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {loading ? labels.ellipsis : labels.similarFind}
        </button>
      </div>
      {error && (
        <div role="alert" className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {results.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {results.map((d) => (
            <li key={d.id}>
              <a
                href={`/documents/${d.id}`}
                className="text-volt-700 hover:underline"
              >
                {d.title}
              </a>{" "}
              <span className="text-slate-500">
                ({d.document_type} · {d.status})
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GrammarSection({
  contentHtml,
  language,
  labels,
}: {
  contentHtml: string;
  language: string;
  labels: AIPanelLabels;
}) {
  const [matches, setMatches] = useState<
    { message: string; shortMessage?: string; replacements?: { value: string }[]; context?: { text: string } }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const text = htmlToText(contentHtml);
      const res = await fetch("/api/ai/grammar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, language }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMatches(data.matches);
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{labels.grammarHeading}</h3>
        <button
          onClick={run}
          disabled={loading}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {loading ? labels.ellipsis : labels.grammarCheck}
        </button>
      </div>
      {error && (
        <div role="alert" className="mt-2 rounded bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {matches.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {matches.slice(0, 10).map((m, i) => (
            <li key={i} className="rounded bg-amber-50 p-2">
              <span className="font-medium">{m.shortMessage || m.message}</span>
              {m.replacements?.[0] && (
                <span className="text-slate-600"> → {m.replacements[0].value}</span>
              )}
              {m.context && <div className="italic text-slate-500">{m.context.text}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CefrSection({
  contentHtml,
  labels,
}: {
  contentHtml: string;
  labels: AIPanelLabels;
}) {
  const [result, setResult] = useState<{
    level: string;
    score: number;
    avgSentenceLength: number;
    longWordRatio: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const text = htmlToText(contentHtml);
      const res = await fetch("/api/ai/cefr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{labels.cefrHeading}</h3>
        <button
          onClick={run}
          disabled={loading}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {loading ? labels.ellipsis : labels.cefrAnalyze}
        </button>
      </div>
      {result && (
        <div className="mt-2 rounded bg-slate-50 p-3 text-xs">
          <div>
            <span className="font-medium">{result.level}</span>{" "}
            <span className="text-slate-500">{labels.cefrScore(result.score)}</span>
          </div>
          <div className="text-slate-600">
            {labels.cefrAvgSentence(result.avgSentenceLength.toFixed(1))}
          </div>
          <div className="text-slate-600">
            {labels.cefrLongWord((result.longWordRatio * 100).toFixed(1))}
          </div>
        </div>
      )}
    </section>
  );
}
