import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { LANG_LABELS, SUPPORTED_LANGUAGES } from "@/lib/i18n/dictionaries";
import { createTranslation } from "./actions";

export default async function TranslationsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createClient();

  const { data: doc } = await db
    .from("documents")
    .select("id,title,language,current_version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: trs } = await db
    .from("document_translations")
    .select("language,status,source_version,verified_at,updated_at")
    .eq("document_id", id);

  const targetLanguages = SUPPORTED_LANGUAGES.filter((l) => l !== doc.language);

  return (
    <div className="max-w-2xl">
      <Link href={`/documents/${id}`} className="text-sm text-slate-500 hover:underline">
        ← Back to document
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Translations</h1>
      <p className="mt-1 text-slate-600">
        {doc.title} · source: {LANG_LABELS[doc.language as keyof typeof LANG_LABELS] ?? doc.language}
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source v</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(trs ?? []).map((t) => (
              <tr key={t.language}>
                <td className="px-4 py-3 font-medium">
                  {LANG_LABELS[t.language as keyof typeof LANG_LABELS] ?? t.language}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      t.status === "verified"
                        ? "bg-green-100 text-green-800"
                        : t.status === "in_review"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">v{t.source_version}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/documents/${id}/translations/${t.language}`}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {(trs ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-slate-500">
                  No translations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Start a new translation</h2>
      <form action={createTranslation} className="mt-3 flex items-end gap-3">
        <input type="hidden" name="document_id" value={id} />
        <div>
          <label htmlFor="language" className="block text-xs uppercase tracking-wider text-slate-500">
            Target language
          </label>
          <select
            id="language"
            name="language"
            className="mt-1 rounded border border-slate-300 px-3 py-2"
            required
          >
            {targetLanguages.map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700">
          Start
        </button>
      </form>
    </div>
  );
}
