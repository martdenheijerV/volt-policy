import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { getTr } from "@/lib/i18n/server";
import { T } from "@/components/T";
import AdminTabs from "./AdminTabs";

/**
 * /admin layout — the "Beheer" surface. Three tabs:
 *
 *   1. Personen   — user accounts + role assignments. The departments
 *                   block at the bottom of this tab is the admin's
 *                   surface for creating departments and assigning
 *                   department leads (drivers of the
 *                   policy_lead_department role's scope).
 *   2. Groepen    — working-group CRUD, group membership, per-group
 *                   policy_lead assignments, and per-member read/edit
 *                   toggles. After 015_scoped_permissions, this is
 *                   the canonical surface for "who can do what" inside
 *                   a working group.
 *   3. Afdelingen — the same per-member toggle UI as Groepen, scoped
 *                   to organisational departments (Volt EP / Volt NL /
 *                   …). Drills down into /admin/departments/<id>.
 *
 * The previous "Document types" matrix tab is gone — replaced by the
 * per-scope per-member model that 015_scoped_permissions established.
 *
 * Admin-only — non-admins are kicked back to /dashboard before any
 * tab content renders. The single exception is /admin/groups, which
 * still allows policy_lead and policy_lead_department a read-only
 * view of their own groups; that page enforces the read-only mode
 * itself, so we let those roles pass the guard here.
 */
const TABS = [
  { slug: "users", label: "Personen" },
  { slug: "groups", label: "Groepen" },
  { slug: "departments", label: "Afdelingen" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const isAdmin = me?.role === "admin";
  const isPolicyLead =
    me?.role === "policy_lead" || me?.role === "policy_lead_department";
  if (!isAdmin && !isPolicyLead) {
    redirect("/dashboard");
  }

  const tabLabels = await Promise.all(TABS.map((t) => tr(t.label)));
  const tabs = TABS.map((t, i) => ({ slug: t.slug, label: tabLabels[i] }));

  return (
    <div>
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold">
          <T>Beheer</T>
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          <T>
            Manage people, working groups and departments for the whole
            organisation.
          </T>
        </p>
      </div>
      {/*
        Non-admins (policy leads viewing their own groups) only get
        the Groepen tab — the others are admin-only surfaces.
      */}
      <AdminTabs tabs={isAdmin ? tabs : tabs.filter((t) => t.slug === "groups")} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
