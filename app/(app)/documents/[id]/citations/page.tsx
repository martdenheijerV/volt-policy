import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { addCitation, deleteCitation } from "./actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

export default async function CitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { tr } = await getTr();
  const { data: doc } = await supabase
    .from("documents")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: cites } = await supabase
    .from("citations")
    .select("*")
    .eq("document_id", id)
    .order("cite_key");

  const [
    titleLabel,
    authorLabel,
    yearLabel,
    sourceLabel,
    urlLabel,
    addCitationLabel,
    linkLabel,
    deleteLabel,
    noCitations,
  ] = await Promise.all([
    tr("Title"),
    tr("Author"),
    tr("Year"),
    tr("Source / Publisher"),
    tr("URL"),
    tr("Add citation"),
    tr("Link"),
    tr("Delete"),
    tr("No citations yet."),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href={`/documents/${id}`} className="text-sm text-slate-500 hover:underline">
        ← <T>Back to document</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        <T>Citations</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Reference using [@cite_key] in the document body. Bibliography is
          auto-rendered on export.
        </T>
      </p>

      <form
        action={addCitation}
        className="mt-6 grid gap-3 rounded border bg-white p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="document_id" value={id} />
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            cite_key *
          </label>
          <input
            name="cite_key"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="ipcc2023"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {titleLabel} *
          </label>
          <input
            name="title"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {authorLabel}
          </label>
          <input name="author" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {yearLabel}
          </label>
          <input name="year" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {sourceLabel}
          </label>
          <input name="source" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">
            {urlLabel}
          </label>
          <input name="url" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
        </div>
        <div className="sm:col-span-2">
          <button className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700">
            {addCitationLabel}
          </button>
        </div>
      </form>

      <ul className="mt-6 space-y-2">
        {(cites ?? []).map((c) => (
          <li key={c.id} className="rounded border bg-white p-3 text-sm">
            <div className="flex items-start justify-between">
              <div>
                <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  [@{c.cite_key}]
                </code>{" "}
                <span className="font-medium">{c.title}</span>
                <div className="text-slate-600">
                  {c.author && `${c.author}. `}
                  {c.year && `(${c.year}). `}
                  {c.source && `${c.source}. `}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-volt-700 underline"
                    >
                      {linkLabel}
                    </a>
                  )}
                </div>
              </div>
              <form action={async () => { "use server"; await deleteCitation(c.id, id); }}>
                <button className="text-xs text-red-700 hover:underline">{deleteLabel}</button>
              </form>
            </div>
          </li>
        ))}
        {(cites ?? []).length === 0 && (
          <li className="rounded border bg-white p-6 text-center text-sm text-slate-500">
            {noCitations}
          </li>
        )}
      </ul>
    </div>
  );
}
