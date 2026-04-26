import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import RestoreButton from "./RestoreButton";
import HideToggle from "./HideToggle";
import { formatDate } from "@/lib/utils";
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
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle<DocWithHidden>();

  if (!doc) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
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

  const { data: versions } = await supabase
    .from("document_versions")
    .select("*")
    .eq("document_id", id)
    .order("version_number", { ascending: false });

  const hiddenSet = new Set(doc.hidden_versions ?? []);
  const visible = (versions as DocumentVersion[] | null ?? []).filter(
    (v) => isAdmin || !hiddenSet.has(v.version_number)
  );

  return (
    <div>
      <Link
        href={`/documents/${doc.id}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← Back to document
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Version history</h1>
      <p className="mt-1 text-sm text-slate-600">{doc.title}</p>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Change summary</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 w-44">Actions</th>
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
                        hidden
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
                          Diff
                        </a>
                      )}
                      {canEdit && v.version_number < doc.current_version && (
                        <RestoreButton
                          documentId={doc.id}
                          versionNumber={v.version_number}
                        />
                      )}
                      {isAdmin && (
                        <HideToggle
                          documentId={doc.id}
                          versionNumber={v.version_number}
                          isHidden={isHidden}
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
