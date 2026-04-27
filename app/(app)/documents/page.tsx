import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import { T } from "@/components/T";
import { getT, getTr } from "@/lib/i18n/server";
import type { Document, DocStatus } from "@/lib/types";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: DocStatus; type?: string }>;
}) {
  const { t } = await getT();
  const { tr } = await getTr();
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

  const statusKey: Record<string, string> = {
    draft: "doc.statusDraft",
    review: "doc.statusReview",
    approved: "doc.statusApproved",
    archived: "doc.statusArchived",
  };

  // Pre-translate strings used inside attributes (placeholder, aria-label).
  const [
    searchPlaceholder,
    searchAria,
    statusAllLabel,
    typeAllLabel,
    typePolicy,
    typePosition,
    typeResolution,
    typeStatement,
    typeMotion,
    typeOther,
  ] = await Promise.all([
    tr("Search title, purpose, content…"),
    tr("Search documents"),
    tr("All statuses"),
    tr("All types"),
    tr("Policy"),
    tr("Position"),
    tr("Resolution"),
    tr("Statement"),
    tr("Motion"),
    tr("Other"),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.documents")}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <T>All policy documents visible to you.</T>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/documents/import"
            className="rounded border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
          >
            ↥ <T>Import</T>
          </Link>
          <Link
            href="/documents/new"
            className="rounded bg-volt-600 px-4 py-2 font-medium text-white hover:bg-volt-700"
          >
            {t("doc.new")}
          </Link>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap gap-3" action="/documents">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={searchPlaceholder}
          className="min-w-[240px] flex-1 rounded border border-slate-300 px-3 py-2"
          aria-label={searchAria}
        />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label={t("doc.status")}
        >
          <option value="">{statusAllLabel}</option>
          <option value="draft">{t("doc.statusDraft")}</option>
          <option value="review">{t("doc.statusReview")}</option>
          <option value="approved">{t("doc.statusApproved")}</option>
          <option value="archived">{t("doc.statusArchived")}</option>
        </select>
        <select
          name="type"
          defaultValue={params.type ?? ""}
          className="rounded border border-slate-300 px-3 py-2"
          aria-label={t("doc.type")}
        >
          <option value="">{typeAllLabel}</option>
          <option value="policy">{typePolicy}</option>
          <option value="position">{typePosition}</option>
          <option value="resolution">{typeResolution}</option>
          <option value="statement">{typeStatement}</option>
          <option value="motion">{typeMotion}</option>
          <option value="other">{typeOther}</option>
        </select>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-white"
        >
          <T>Filter</T>
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
                <th className="px-4 py-3">{t("doc.title")}</th>
                <th className="px-4 py-3">{t("doc.type")}</th>
                <th className="px-4 py-3">{t("doc.language")}</th>
                <th className="px-4 py-3">{t("doc.status")}</th>
                <th className="px-4 py-3">{t("doc.version")}</th>
                <th className="px-4 py-3"><T>Updated</T></th>
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
                        {d.tags.map((tg) => (
                          <span
                            key={tg}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {tg}
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
                      {t(statusKey[d.status] ?? d.status)}
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
            <T>No documents match your filters.</T>
          </div>
        )}
      </div>
    </div>
  );
}
