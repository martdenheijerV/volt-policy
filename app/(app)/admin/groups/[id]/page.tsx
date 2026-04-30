import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import {
  addGroupPermission,
  deleteGroupPermission,
  removeMember,
  deleteGroup,
} from "../actions";
import GroupActions, { type GroupActionsLabels } from "./GroupActions";
import MemberLeadToggle from "./MemberLeadToggle";
import { T } from "@/components/T";
import { getT, getTr } from "@/lib/i18n/server";
import { DOC_TYPES, DOC_TYPE_LABELS } from "@/lib/doc-types";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { t } = await getT();
  const { tr } = await getTr();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: group } = await supabase
    .from("user_groups")
    .select("id,name,description")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  // Members (with full_name and role) — raw SQL because the shim doesn't
  // implement PostgREST's foreign-key join syntax.
  const userId = await getCurrentUserId();
  const members = await withUser(userId, async (sql) => {
    return await sql<{
      user_id: string;
      profile_id: string | null;
      full_name: string | null;
      role: string | null;
    }[]>`
      select m.user_id,
             p.id   as profile_id,
             p.full_name,
             p.role
        from public.user_group_members m
        left join public.profiles p on p.id = m.user_id
       where m.group_id = ${id}
    `;
  });

  const { data: permissions } = await supabase
    .from("group_doc_permissions")
    .select("id,document_type,status,can_read,can_edit,can_comment,can_approve")
    .eq("group_id", id)
    .order("created_at");

  // Per-group policy lead assignments. Cheap query — typically one
  // group has 0–3 leads. Used to render the "Lead" badge + toggle
  // in the members table below.
  const { data: leads } = await supabase
    .from("user_group_leads")
    .select("user_id")
    .eq("group_id", id);
  const leadIds = new Set((leads ?? []).map((l) => l.user_id));

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id,full_name,role")
    .order("full_name");

  const [
    typeAll,
    statusAll,
    addRule,
    readCol,
    commentCol,
    editCol,
    approveCol,
    typeCol,
    statusCol,
    unknown,
    remove,
    noMembers,
    noRules,
    deleteGroupBtn,
    addMemberLabel,
    addLabel,
    addingLabel,
    leadLabel,
    makeLeadLabel,
    unmakeLeadLabel,
    failedLabel,
  ] = await Promise.all([
    tr("Any"),
    tr("Any"),
    tr("Add rule"),
    tr("Read"),
    tr("Comment"),
    tr("Edit"),
    tr("Approve"),
    tr("Type"),
    tr("Status"),
    tr("Unknown"),
    tr("Remove"),
    tr("No members"),
    tr("No rules yet"),
    tr("Delete group"),
    tr("Add member…"),
    tr("Add"),
    tr("Adding…"),
    tr("Lead"),
    tr("Make lead"),
    tr("Remove lead"),
    tr("Failed"),
  ]);

  // Pre-translate every doc-type label once (cached after first fetch).
  const typeLabelEntries = await Promise.all(
    DOC_TYPES.map(async (k) => [k, await tr(DOC_TYPE_LABELS[k])] as const)
  );
  const typeLabels = Object.fromEntries(typeLabelEntries) as Record<
    (typeof DOC_TYPES)[number],
    string
  >;

  const groupActionsLabels: GroupActionsLabels = {
    addMember: addMemberLabel,
    add: addLabel,
    adding: addingLabel,
  };

  return (
    <div>
      <Link href="/admin/groups" className="text-sm text-slate-500 hover:underline">
        ← <T>All groups</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">{group.name}</h1>
      {group.description && <p className="mt-1 text-slate-600">{group.description}</p>}

      <GroupActions
        groupId={group.id}
        allProfiles={allProfiles ?? []}
        memberIds={members.map((m) => m.user_id)}
        labels={groupActionsLabels}
      />

      <h2 className="mt-8 text-xl font-semibold">
        <T>Members</T>
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  {m.full_name ?? <em className="text-slate-400">{unknown}</em>}
                </td>
                <td className="px-4 py-2 text-slate-500 capitalize">{m.role}</td>
                <td className="px-4 py-2">
                  <MemberLeadToggle
                    groupId={group.id}
                    userId={m.user_id}
                    initialLead={leadIds.has(m.user_id)}
                    labels={{
                      lead: leadLabel,
                      makeLead: makeLeadLabel,
                      unmakeLead: unmakeLeadLabel,
                      failed: failedLabel,
                    }}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={async () => { "use server"; await removeMember(group.id, m.user_id); }}>
                    <button className="text-xs text-red-700 hover:underline">{remove}</button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td className="p-4 text-center text-sm text-slate-500">{noMembers}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-semibold">
        <T>Permission rules</T>
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Each rule says: members of this group get the checked permissions on
          documents matching the chosen type and status (leave blank = any).
        </T>
      </p>

      <form action={addGroupPermission} className="mt-3 flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <input type="hidden" name="group_id" value={group.id} />
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">{typeCol}</label>
          <select name="document_type" className="mt-1 rounded border border-slate-300 px-2 py-1">
            <option value="">{typeAll}</option>
            {DOC_TYPES.map((k) => (
              <option key={k} value={k}>
                {typeLabels[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">{statusCol}</label>
          <select name="status" className="mt-1 rounded border border-slate-300 px-2 py-1">
            <option value="">{statusAll}</option>
            <option value="draft">{t("doc.statusDraft")}</option>
            <option value="review">{t("doc.statusReview")}</option>
            <option value="approved">{t("doc.statusApproved")}</option>
            <option value="archived">{t("doc.statusArchived")}</option>
          </select>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_read" defaultChecked /> {readCol}
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_comment" defaultChecked /> {commentCol}
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_edit" /> {editCol}
        </label>
        <label className="flex items-center gap-1 text-sm" title="Allows policy_lead members to approve docs matching this rule">
          <input type="checkbox" name="can_approve" /> {approveCol}
        </label>
        <button type="submit" className="rounded bg-volt-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-volt-700">
          {addRule}
        </button>
      </form>

      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">{typeCol}</th>
              <th className="px-4 py-2">{statusCol}</th>
              <th className="px-4 py-2">{readCol}</th>
              <th className="px-4 py-2">{commentCol}</th>
              <th className="px-4 py-2">{editCol}</th>
              <th className="px-4 py-2">{approveCol}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(permissions ?? []).map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.document_type ?? "any"}</td>
                <td className="px-4 py-2">{r.status ?? "any"}</td>
                <td className="px-4 py-2">{r.can_read ? "✓" : ""}</td>
                <td className="px-4 py-2">{r.can_comment ? "✓" : ""}</td>
                <td className="px-4 py-2">{r.can_edit ? "✓" : ""}</td>
                <td className="px-4 py-2">{r.can_approve ? "✓" : ""}</td>
                <td className="px-4 py-2 text-right">
                  <form action={async () => { "use server"; await deleteGroupPermission(r.id, group.id); }}>
                    <button className="text-xs text-red-700 hover:underline">{remove}</button>
                  </form>
                </td>
              </tr>
            ))}
            {(permissions ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-sm text-slate-500">
                  {noRules}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={async () => { "use server"; await deleteGroup(group.id); redirect("/admin/groups"); }} className="mt-10">
        <button className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          {deleteGroupBtn}
        </button>
      </form>
    </div>
  );
}
