import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import type { Document, DocStatus } from "@/lib/types";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: DocStatus; type?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (params.q) query = query.textSearch("search_tsv", params.q, { type: "websearch" });
  if (params.status) query = query.eq("status", params.status);
  if (params.type) query = query.eq("document_type", params.type);

  const { data, error } = await query;

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Documents</h1>
          <p className="mt-1 text-sm text-slate-600">
            All policy documents visible to you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/documents/import"
            className="rounded border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
          >
            ↥ Import
          </Link>
          <Link
            href="/documents/new"
            className="rounded bg-volt-600 px-4 py-2 font-medium text-white hover:bg-volt-700"
          >
            + New document
          </Link>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap gap-3" action="/documents">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search title, purpose, content…"
          className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2"
          aria-label="Search documents"
        />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="approved">Approved</option>
          <option value="archived">Archived</option>
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="policy">Policy</option>
          <option value="position">Position</option>
          <option value="resolution">Resolution</option>
          <option value="statement">Statement</option>
          <option value="motion">Motion</option>
          <option value="other">Other</option>
        </select>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          Filter
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-6 rounded bg-red-50 p-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        {(data as Document[] | null)?.length ? (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Lang</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data as Document[]).map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/documents/${d.id}`}
                      className="font-medium text-volt-700 hover:underline"
                    >
                      {d.title}
                    </Link>
                    {d.tags?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 capitalize">{d.document_type}</td>
                  <td className="px-4 py-3 uppercase">{d.language}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
                        d.status
                      )}`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">v{d.current_version}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(d.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No documents match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
