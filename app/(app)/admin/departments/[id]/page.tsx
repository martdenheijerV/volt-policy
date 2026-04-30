import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import {
  addDepartmentMember,
  removeDepartmentMember,
} from "../actions";
import DepartmentMemberRightsToggle from "./DepartmentMemberRightsToggle";
import AddDepartmentMemberForm from "./AddDepartmentMemberForm";

/**
 * Department detail page. Twin of /admin/groups/[id], scoped to a
 * department. Shows:
 *
 *   - Department metadata (name, description)
 *   - Leads (read-only here; assignment lives on the Personen tab's
 *     DepartmentsCard so admins have one canonical surface for it)
 *   - Members + per-member can_read / can_edit toggles
 *   - Add-member combo (admin-only)
 *
 * Admin-only — leads can flip per-member rights via the toggle (RLS
 * gates that), but the page itself is gated to admins to keep the
 * surface area predictable. If we later open it to leads, the gate
 * here is the only thing that needs to relax.
 */
export default async function DepartmentDetailPage({
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

  const { data: department } = await db
    .from("departments")
    .select("id,name,description")
    .eq("id", id)
    .maybeSingle();
  if (!department) notFound();

  const userId = await getCurrentUserId();
  const members = userId
    ? await withUser(userId, async (sql) => {
        return await sql<
          {
            user_id: string;
            full_name: string | null;
            role: string | null;
            can_read: boolean;
            can_edit: boolean;
          }[]
        >`
          select dmp.user_id,
                 p.full_name,
                 p.role,
                 dmp.can_read,
                 dmp.can_edit
            from public.department_member_permissions dmp
            left join public.profiles p on p.id = dmp.user_id
           where dmp.department_id = ${id}
           order by p.full_name nulls last
        `;
      })
    : [];

  const { data: leadRows } = await db
    .from("department_leads")
    .select("user_id")
    .eq("department_id", id);
  const leadIds = new Set((leadRows ?? []).map((l) => l.user_id));

  const { data: leadProfiles } = await db
    .from("profiles")
    .select("id,full_name")
    .in("id", Array.from(leadIds));

  const { data: allProfiles } = await db
    .from("profiles")
    .select("id,full_name,role")
    .order("full_name");

  const [
    backToList,
    leadsHeading,
    noLeadsHint,
    membersHeading,
    membersIntro,
    canReadLabel,
    canEditLabel,
    nameCol,
    roleCol,
    leadBadge,
    removeLabel,
    noMembers,
    failedLabel,
    addMemberLabel,
  ] = await Promise.all([
    tr("All departments"),
    tr("Leads"),
    tr(
      "Department leads have full rights inside this department by default. Assign or unassign leads from the Personen tab."
    ),
    tr("Members"),
    tr(
      "Tick Read to give the member access to drafts in this department, and Edit to also let them change the content."
    ),
    tr("Read"),
    tr("Edit"),
    tr("Name"),
    tr("Role"),
    tr("Lead"),
    tr("Remove"),
    tr("No members yet."),
    tr("Failed"),
    tr("Add member"),
  ]);

  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (allProfiles ?? []).filter((p) => !memberIds.has(p.id));

  return (
    <div>
      <Link
        href="/admin/departments"
        className="text-sm text-slate-500 hover:underline"
      >
        ← {backToList}
      </Link>
      <h1 className="mt-2 text-3xl font-bold">{department.name}</h1>
      {department.description && (
        <p className="mt-1 text-slate-600">{department.description}</p>
      )}

      <h2 className="mt-8 text-xl font-semibold">{leadsHeading}</h2>
      <p className="mt-1 text-xs text-slate-500">{noLeadsHint}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {(leadProfiles ?? []).map((p) => (
          <li
            key={p.id}
            className="inline-flex items-center rounded-full bg-volt-50 px-3 py-1 text-xs text-volt-800 ring-1 ring-volt-200"
          >
            {p.full_name ?? p.id.slice(0, 8)}
          </li>
        ))}
        {(leadProfiles ?? []).length === 0 && (
          <li className="text-xs italic text-slate-500">
            <T>No leads assigned</T>
          </li>
        )}
      </ul>

      <h2 className="mt-8 text-xl font-semibold">{membersHeading}</h2>
      <p className="mt-1 text-sm text-slate-600">{membersIntro}</p>

      <AddDepartmentMemberForm
        departmentId={department.id}
        candidates={candidates}
        labels={{ add: addMemberLabel, failed: failedLabel }}
      />

      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">{nameCol}</th>
              <th className="px-4 py-2">{roleCol}</th>
              <th className="px-4 py-2 text-center">{canReadLabel}</th>
              <th className="px-4 py-2 text-center">{canEditLabel}</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const isLead = leadIds.has(m.user_id);
              return (
                <tr key={m.user_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    {m.full_name ?? (
                      <em className="text-slate-400">{m.user_id.slice(0, 8)}</em>
                    )}
                    {isLead && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-volt-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-volt-800">
                        {leadBadge}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500 capitalize">
                    {m.role}
                  </td>
                  <td className="px-4 py-2">
                    <DepartmentMemberRightsToggle
                      departmentId={department.id}
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
                    <DepartmentMemberRightsToggle
                      departmentId={department.id}
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
                  <td className="px-4 py-2 text-right">
                    <form
                      action={async () => {
                        "use server";
                        await removeDepartmentMember(department.id, m.user_id);
                      }}
                    >
                      <button className="text-xs text-red-700 hover:underline">
                        {removeLabel}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-4 text-center text-sm text-slate-500"
                >
                  {noMembers}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
