import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/utils";
import type { Document } from "@/lib/types";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select("*")
    .eq("status", "approved")
    .order("approved_at", { ascending: false });

  if (params.q)
    query = query.textSearch("search_tsv", params.q, { type: "websearch" });
  if (params.type) query = query.eq("document_type", params.type);
  if (params.lang) query = query.eq("language", params.lang);

  const { data } = await query;
  const docs = (data as Document[] | null) ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold">Public policy library</h1>
      <p className="mt-1 text-sm text-slate-600">
        Approved Volt political documents — no login required.
      </p>

      <form className="mt-6 flex flex-wrap gap-3" action="/library">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search approved documents…"
          className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2"
          aria-label="Search"
        />
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label="Type"
        >
          <option value="">All types</option>
          <option value="policy">Policy</option>
          <option value="position">Position</option>
          <option value="resolution">Resolution</option>
          <option value="statement">Statement</option>
          <option value="motion">Motion</option>
          <option value="other">Other</option>
        </select>
        <select
          name="lang"
          defaultValue={params.lang ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label="Language"
        >
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="nl">Dutch</option>
          <option value="it">Italian</option>
          <option value="es">Spanish</option>
        </select>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          Search
        </button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {docs.length === 0 && (
          <div className="sm:col-span-2 rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
            No approved documents match your search yet.
          </div>
        )}
        {docs.map((d) => (
          <Link
            key={d.id}
            href={`/library/${d.slug}`}
            className="block rounded-lg border bg-white p-5 hover:border-volt-400 hover:shadow-sm"
          >
            <div className="text-xs uppercase tracking-wider text-slate-500">
              {d.document_type} · {d.language.toUpperCase()}
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
                {d.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-volt-50 px-2 py-0.5 text-xs text-volt-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 text-xs text-slate-500">
              Approved {d.approved_at ? formatDate(d.approved_at) : "—"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
