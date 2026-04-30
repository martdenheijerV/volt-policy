import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { getTr } from "@/lib/i18n/server";
import { T } from "@/components/T";
import { DOC_TYPES, type DocType } from "@/lib/types";
import PermissionCell from "./PermissionCell";

/**
 * Document types tab — a matrix where every row is a group and every
 * column is a doc_type. Each cell has a Read + Edit checkbox; the
 * matrix is the single canonical surface for type-level access
 * configuration. Per-status overrides remain available via the
 * group detail page (Groepen → manage), since they're a power-user
 * tool that would clutter the grid here.
 *
 * Storage model: each filled cell corresponds to a row in
 * `group_doc_permissions` with `status = null` (applies to every
 * status of that doc type). An empty cell means no row exists.
 *
 * The headings use the doc_type enum value as the visible label —
 * the labels look like `roadmap_local`, `electoral_programme_europe`,
 * etc. They're long, but they're also the names users see across the
 * rest of the app (selectors, search filters), so consistency wins
 * over prettifying them here.
 */
export default async function DocumentTypesPage() {
  const supabase = await createClient();
  const { tr } = await getTr();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") redirect("/admin");

  // Fetch groups + the type-level permission rows in one round-trip
  // each.
  const [{ data: groups }, { data: perms }] = await Promise.all([
    supabase
      .from<{ id: string; name: string; description: string | null }>(
        "user_groups"
      )
      .select("id,name,description")
      .order("name"),
    supabase
      .from<{
        group_id: string;
        document_type: string | null;
        can_read: boolean;
        can_edit: boolean;
      }>("group_doc_permissions")
      .select("group_id,document_type,can_read,can_edit")
      .is("status", null),
  ]);

  // Quick lookup map: groupId → docType → {can_read, can_edit}.
  const permMap = new Map<string, Map<DocType, { read: boolean; edit: boolean }>>();
  for (const p of perms ?? []) {
    if (!p.document_type) continue;
    const inner =
      permMap.get(p.group_id) ?? new Map<DocType, { read: boolean; edit: boolean }>();
    inner.set(p.document_type as DocType, {
      read: !!p.can_read,
      edit: !!p.can_edit,
    });
    permMap.set(p.group_id, inner);
  }

  const [
    intro,
    noGroups,
    groupCol,
    readLabel,
    editLabel,
    failedLabel,
  ] = await Promise.all([
    tr(
      "For each group, tick which document types its members can read and edit. Editing implies reading."
    ),
    tr(
      "No groups yet. Create one on the Groepen tab before configuring document-type access."
    ),
    tr("Group"),
    tr("Read"),
    tr("Edit"),
    tr("Failed"),
  ]);

  if (!groups || groups.length === 0) {
    return (
      <div>
        <p className="text-sm text-slate-600">
          <T>{intro}</T>
        </p>
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {noGroups}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600">{intro}</p>
      {/*
        Two-axis layout: rows = groups, columns = doc types. We use
        rows-per-group rather than rows-per-type because there are far
        more types (≈ 18) than groups (≈ 5) at Volt's scale, and a
        wide-but-short matrix scrolls horizontally less than a tall
        one in the typical 1280-px viewport.
      */}
      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3">
                {groupCol}
              </th>
              {DOC_TYPES.map((dt) => (
                <th
                  key={dt}
                  className="border-l border-slate-100 px-4 py-3 font-mono"
                >
                  {dt}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {groups.map((g) => {
              const inner = permMap.get(g.id);
              return (
                <tr key={g.id} className="align-top">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800">
                    {g.name}
                    {g.description && (
                      <div className="mt-0.5 text-xs font-normal text-slate-500">
                        {g.description}
                      </div>
                    )}
                  </td>
                  {DOC_TYPES.map((dt) => {
                    const cell = inner?.get(dt);
                    return (
                      <td
                        key={dt}
                        className="border-l border-slate-100 px-4 py-3 align-middle"
                      >
                        <PermissionCell
                          groupId={g.id}
                          docType={dt}
                          initialRead={cell?.read ?? false}
                          initialEdit={cell?.edit ?? false}
                          labels={{
                            read: readLabel,
                            edit: editLabel,
                            failed: failedLabel,
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
