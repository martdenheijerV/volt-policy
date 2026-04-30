import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { removeMember, deleteGroup } from "../actions";
import GroupActions, { type GroupActionsLabels } from "./GroupActions";
import MemberLeadToggle from "./MemberLeadToggle";
import MemberRightsToggle from "./MemberRightsToggle";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

/**
 * Group detail page.
 *
 * After 015_scoped_permissions this page is the canonical surface for:
 *   - listing members
 *   - per-member can_read / can_edit toggles (replaces the old
 *     doc_type × status rule grid)
 *   - assigning / unassigning the policy_lead for the group
 *   - adding new members from the user pool
 *   - deleting the group
 *
 * The rule-form and rule-table that used to sit at the bottom — the
 * one that wrote rows to `group_doc_permissions` — is gone. Group
 * leads simply tick read or edit for each member; documents owned
 * by the group inherit those rights automatically through the
 * rewritten doc_visible / doc_editable helpers.
 */
export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createClient();
  const { tr } = await getTr();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: group } = await db
    .from("user_groups")
    .select("id,name,description")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  // Members + per-member rights joined in one round-trip. LEFT JOIN on
  // user_group_member_permissions so a freshly added member with no
  // rights row yet still appears (legacy data path).
  const userId = await getCurrentUserId();
  const members = await withUser(userId, async (sql) => {
    return await sql<
      {
        user_id: string;
        full_name: string | null;
        role: string | null;
        can_read: boolean | null;
        can_edit: boolean | null;
      }[]
    >`
      select m.user_id,
             p.full_name,
             p.role,
             ugmp.can_read,
             ugmp.can_edit
        from public.user_group_members m
        left join public.profiles p on p.id = m.user_id
        left join public.user_group_member_permissions ugmp
               on ugmp.group_id = m.group_id and ugmp.user_id = m.user_id
       where m.group_id = ${id}
       order by p.full_name nulls last
    `;
  });

  // Per-group policy lead assignments. Cheap query — typically one
  // group has 0–3 leads. Used to render the "Lead" badge + toggle
  // in the members table below.
  const { data: leads } = await db
    .from("user_group_leads")
    .select("user_id")
    .eq("group_id", id);
  const leadIds = new Set((leads ?? []).map((l) => l.user_id));

  const { data: allProfiles } = await db
    .from("profiles")
    .select("id,full_name,role")
    .order("full_name");

  const [
    unknown,
    remove,
    noMembers,
    deleteGroupBtn,
    addMemberLabel,
    addLabel,
    addingLabel,
    leadLabel,
    makeLeadLabel,
    unmakeLeadLabel,
    failedLabel,
    rightsHeading,
    rightsHint,
    canReadLabel,
    canEditLabel,
    rightsExplainer,
  ] = await Promise.all([
    tr("Unknown"),
    tr("Remove"),
    tr("No members"),
    tr("Delete group"),
    tr("Add member…"),
    tr("Add"),
    tr("Adding…"),
    tr("Lead"),
    tr("Make lead"),
    tr("Remove lead"),
    tr("Failed"),
    tr("Per-member rights"),
    tr(
      "Members can read documents owned by this group by default. Tick Edit to also let them change the content. The lead always has full rights — no toggle needed."
    ),
    tr("Read"),
    tr("Edit"),
    tr(
      "Edit implies Read. Approving a draft (review → approved) is reserved to the lead and admins."
    ),
  ]);

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

      <h2 className="mt-8 text-xl font-semibold">{rightsHeading}</h2>
      <p className="mt-1 text-sm text-slate-600">{rightsHint}</p>
      <p className="mt-1 text-xs text-slate-500">{rightsExplainer}</p>

      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2"><T>Name</T></th>
              <th className="px-4 py-2"><T>Role</T></th>
              <th className="px-4 py-2 text-center">{canReadLabel}</th>
              <th className="px-4 py-2 text-center">{canEditLabel}</th>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const isLead = leadIds.has(m.user_id);
              return (
                <tr key={m.user_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {m.full_name ?? <em className="text-slate-400">{unknown}</em>}
                  </td>
                  <td className="px-4 py-2 text-slate-500 capitalize">{m.role}</td>
                  <td className="px-4 py-2">
                    <MemberRightsToggle
                      groupId={group.id}
                      userId={m.user_id}
                      isLead={isLead}
                      initialRead={!!m.can_read || !!m.can_edit}
                      initialEdit={!!m.can_edit}
                      cellKind="read"
                      labels={{
                        failed: failedLabel,
                        readAria: canReadLabel,
                        editAria: canEditLabel,
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <MemberRightsToggle
                      groupId={group.id}
                      userId={m.user_id}
                      isLead={isLead}
                      initialRead={!!m.can_read || !!m.can_edit}
                      initialEdit={!!m.can_edit}
                      cellKind="edit"
                      labels={{
                        failed: failedLabel,
                        readAria: canReadLabel,
                        editAria: canEditLabel,
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <MemberLeadToggle
                      groupId={group.id}
                      userId={m.user_id}
                      initialLead={isLead}
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
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-sm text-slate-500">
                  {noMembers}
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
