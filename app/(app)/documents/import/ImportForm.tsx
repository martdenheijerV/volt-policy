"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ImportFormLabels {
  fileLabel: string;
  typeLabel: string;
  languageLabel: string;
  typePolicy: string;
  typePosition: string;
  typeResolution: string;
  typeStatement: string;
  typeMotion: string;
  typeOther: string;
  importing: string;
  importBtn: string;
  importFailed: string;
}

export default function ImportForm({ labels }: { labels: ImportFormLabels }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("policy");
  const [language, setLanguage] = useState("en");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("document_type", docType);
    fd.set("language", language);
    const res = await fetch("/api/documents/import", { method: "POST", body: fd });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? labels.importFailed);
      return;
    }
    router.push(`/documents/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 rounded border bg-white p-4">
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-500">
          {labels.fileLabel}
        </label>
        <input
          type="file"
          accept=".docx,.pdf,.html,.htm,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
          className="mt-1 block w-full text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {labels.typeLabel}
          </label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="policy">{labels.typePolicy}</option>
            <option value="position">{labels.typePosition}</option>
            <option value="resolution">{labels.typeResolution}</option>
            <option value="statement">{labels.typeStatement}</option>
            <option value="motion">{labels.typeMotion}</option>
            <option value="other">{labels.typeOther}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {labels.languageLabel}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="en">English</option>
            <option value="nl">Nederlands</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>
      {error && (
        <div role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending || !file}
        className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
      >
        {pending ? labels.importing : labels.importBtn}
      </button>
    </form>
  );
}
