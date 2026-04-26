"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ImportPage() {
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
      setError(data.error ?? "Import failed");
      return;
    }
    router.push(`/documents/${data.id}`);
  }

  return (
    <div className="max-w-xl">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← All documents
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Import a document</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a <code>.docx</code>, <code>.pdf</code>, <code>.html</code>,
        <code>.md</code> or <code>.txt</code> file. We&apos;ll create a draft you
        can review before publishing.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded border bg-white p-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            File
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
              Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="policy">Policy</option>
              <option value="position">Position</option>
              <option value="resolution">Resolution</option>
              <option value="statement">Statement</option>
              <option value="motion">Motion</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-500">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="en">English</option>
              <option value="nl">Dutch</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="it">Italian</option>
              <option value="es">Spanish</option>
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
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
    </div>
  );
}
