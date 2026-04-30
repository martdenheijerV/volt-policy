import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

/**
 * /admin/departments — landing page for the new Afdelingen tab. Shows
 * every department, member count, lead count, and a deep link into
 * the detail view where per-member can_read / can_edit lives.
 *
 * Department CRUD itself is still on /admin/users (the
 * DepartmentsCard at the bottom of Personen) so admins have one place
 * to create + assign leads. We don't duplicate that surface; this
 * page is the read + drill-down experience.
 *
 * Admin-only — non-admins fall back to /dashboard.
 */
export default async function DepartmentsIndexPage() {
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

  const userId = await getCurrentUserId();
  // Counts per department in one round-trip. The shim doesn't do
  // grouped aggregates well, so we drop to raw SQL.
  const rows = userId
    ? await withUser(userId, async (sql) => {
        return await sql<
          {
            id: string;
            name: string;
            description: string | null;
            member_count: number;
            lead_count: number;
          }[]
        >`
          select d.id,
                 d.name,
                 d.description,
                 (
                   select count(*)::int
                     from public.department_member_permissions m
                    where m.department_id = d.id
                 ) as member_count,
                 (
                   select count(*)::int
                     from public.department_leads dl
                    where dl.department_id = d.id
                 ) as lead_count
            from public.departments d
           order by d.name
        `;
      })
    : [];

  const [intro, manageOnUsersTab, openLabel, membersLabel, leadsLabel, noDepts] =
    await Promise.all([
      tr(
        "Pick a department to manage its members' read and edit access. Department CRUD and lead assignment lives on the Personen tab."
      ),
      tr("Manage departments"),
      tr("Open"),
      tr("members"),
      tr("leads"),
      tr("No departments yet."),
    ]);

  return (
    <div>
      <p className="text-sm text-slate-600">{intro}</p>
      <p className="mt-1 text-xs text-slate-500">
        <Link href="/admin/users" className="underline hover:text-slate-700">
          → {manageOnUsersTab}
        </Link>
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {noDepts}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-lg border bg-white">
          {rows.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{d.name}</div>
                {d.description && (
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {d.description}
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  {d.member_count} {membersLabel} · {d.lead_count} {leadsLabel}
                </div>
              </div>
              <Link
                href={`/admin/departments/${d.id}`}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                {openLabel}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
