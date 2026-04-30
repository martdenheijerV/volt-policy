import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/utils";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import { docTypeLabel } from "@/lib/doc-types";
import type { Document } from "@/lib/types";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; lang?: string }>;
}) {
  const { tr } = await getTr();
  const params = await searchParams;
  const db = await createClient();

  // Public layer: every doc that has been approved at least once shows
  // up — even if it's currently in 'draft' (an editor is preparing the
  // next version). Public always reads from document_versions[approved_version_number]
  // so they see the last-approved snapshot, never a working draft.
  // Archived docs stay hidden.
  let query = db
    .from("documents")
    .select("*")
    // approved_version_number is >= 1 once a doc has been approved at
    // least once (versions start at 1). Using gte instead of "is not null"
    // because the lightweight DB shim doesn't implement .not().
    .gte("approved_version_number", 1)
    .neq("status", "archived")
    .order("approved_at", { ascending: false });

  if (params.q)
    query = query.textSearch("search_tsv", params.q, { type: "websearch" });
  if (params.type) query = query.eq("document_type", params.type);
  if (params.lang) query = query.eq("language", params.lang);

  const { data } = await query;
  const docs = (data as Document[] | null) ?? [];

  const [
    searchPlaceholder,
    searchAria,
    typeAria,
    langAria,
    typeAll,
    langAll,
    typePolicy,
    typePosition,
    typeResolution,
    typeStatement,
    typeMotion,
    typeOther,
    searchBtn,
    approvedLabel,
  ] = await Promise.all([
    tr("Search approved documents…"),
    tr("Search"),
    tr("Type"),
    tr("Language"),
    tr("All types"),
    tr("All languages"),
    tr("Policy"),
    tr("Position"),
    tr("Resolution"),
    tr("Statement"),
    tr("Motion"),
    tr("Other"),
    tr("Search"),
    tr("Approved"),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold">
        <T>Public policy library</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>Approved Volt political documents — no login required.</T>
      </p>

      <form className="mt-6 flex flex-wrap gap-3" action="/library">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={searchPlaceholder}
          className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2"
          aria-label={searchAria}
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label={typeAria}
        >
          <option value="">{typeAll}</option>
          <option value="policy">{typePolicy}</option>
          <option value="position">{typePosition}</option>
          <option value="resolution">{typeResolution}</option>
          <option value="statement">{typeStatement}</option>
          <option value="motion">{typeMotion}</option>
          <option value="other">{typeOther}</option>
        </select>
        <select
          name="lang"
          defaultValue={params.lang ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label={langAria}
        >
          <option value="">{langAll}</option>
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="nl">Nederlands</option>
          <option value="it">Italiano</option>
          <option value="es">Español</option>
        </select>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          {searchBtn}
        </button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {docs.length === 0 && (
          <div className="sm:col-span-2 rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
            <T>No approved documents match your search yet.</T>
          </div>
        )}
        {docs.map((d) => (
          <Link
            key={d.id}
            href={`/library/${d.slug}`}
            className="block rounded-lg border bg-white p-5 hover:border-volt-400 hover:shadow-sm"
          >
            <div className="text-xs uppercase tracking-wider text-slate-500">
              {docTypeLabel(d.document_type)} · {d.language.toUpperCase()}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {d.title}
            </h2>
            {d.purpose && (
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                {d.purpose}
              </p>
            )}
            {d.tags?.length ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {d.tags.map((tg) => (
                  <span
                    key={tg}
                    className="rounded bg-volt-50 px-2 py-0.5 text-xs text-volt-700"
                  >
                    {tg}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 text-xs text-slate-500">
              {approvedLabel} {d.approved_at ? formatDate(d.approved_at) : "—"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
