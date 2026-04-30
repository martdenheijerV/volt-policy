import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import RestoreButton, { type RestoreButtonLabels } from "./RestoreButton";
import HideToggle, { type HideToggleLabels } from "./HideToggle";
import { formatDate } from "@/lib/utils";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import type { Document, DocumentVersion, Profile } from "@/lib/types";

interface DocWithHidden extends Document {
  hidden_versions?: number[];
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createClient();
  const { tr } = await getTr();

  const { data: doc } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle<DocWithHidden>();

  if (!doc) notFound();

  const {
    data: { user },
  } = await db.auth.getUser();

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user?.id ?? "")
    .maybeSingle<Profile>();

  const isAdmin = profile?.role === "admin";
  const canEdit =
    !!user &&
    (isAdmin ||
      profile?.role === "editor" ||
      doc.owner_id === user.id);

  const { data: versions } = await db
    .from("document_versions")
    .select("*")
    .eq("document_id", id)
    .order("version_number", { ascending: false });

  const hiddenSet = new Set(doc.hidden_versions ?? []);
  const visible = (versions as DocumentVersion[] | null ?? []).filter(
    (v) => isAdmin || !hiddenSet.has(v.version_number)
  );

  const [
    versionCol,
    titleCol,
    changeSummaryCol,
    dateCol,
    actionsCol,
    diffLabel,
    hiddenLabel,
    restoreConfirmTpl,
    restoring,
    restore,
    show,
    hide,
    ellipsis,
    titleShow,
    titleHide,
  ] = await Promise.all([
    tr("Version"),
    tr("Title"),
    tr("Change summary"),
    tr("Date"),
    tr("Actions"),
    tr("Diff"),
    tr("hidden"),
    tr("Restore v{n} as a new version?"),
    tr("Restoring…"),
    tr("Restore"),
    tr("Show"),
    tr("Hide"),
    tr("…"),
    tr("Show this version to non-admins"),
    tr("Hide this version from non-admins"),
  ]);

  const restoreLabels: RestoreButtonLabels = {
    confirmTpl: restoreConfirmTpl,
    restoring,
    restore,
  };
  const hideLabels: HideToggleLabels = {
    show,
    hide,
    ellipsis,
    titleShow,
    titleHide,
  };

  return (
    <div>
      <Link
        href={`/documents/${doc.id}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← <T>Back to document</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        <T>Version history</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">{doc.title}</p>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">{versionCol}</th>
              <th className="px-4 py-3">{titleCol}</th>
              <th className="px-4 py-3">{changeSummaryCol}</th>
              <th className="px-4 py-3">{dateCol}</th>
              <th className="px-4 py-3 w-44">{actionsCol}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((v) => {
              const isHidden = hiddenSet.has(v.version_number);
              return (
                <tr
                  key={v.id}
                  className={`hover:bg-slate-50 ${isHidden ? "bg-slate-50/60 opacity-70" : ""}`}
                >
                  <td className="px-4 py-3 font-mono">v{v.version_number}</td>
                  <td className="px-4 py-3">
                    {v.title}
                    {isHidden && (
                      <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-700">
                        {hiddenLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {v.change_summary ?? <em className="text-slate-400">—</em>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(v.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {v.version_number < doc.current_version && (
                        <a
                          href={`/documents/${doc.id}/compare?from=${v.version_number}&to=${doc.current_version}`}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          {diffLabel}
                        </a>
                      )}
                      {canEdit && v.version_number < doc.current_version && (
                        <RestoreButton
                          documentId={doc.id}
                          versionNumber={v.version_number}
                          labels={restoreLabels}
                        />
                      )}
                      {isAdmin && (
                        <HideToggle
                          documentId={doc.id}
                          versionNumber={v.version_number}
                          isHidden={isHidden}
                          labels={hideLabels}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
