import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { getTr } from "@/lib/i18n/server";
import { T } from "@/components/T";
import AdminTabs from "./AdminTabs";

/**
 * /admin layout — the "Beheer" surface. Three tabs:
 *
 *   1. Personen       — user accounts + role assignments + the
 *                       department layer (organisational units like
 *                       Volt EP, Volt NL) and their leads. The
 *                       department leads drive the policy_lead_department
 *                       role's scope.
 *   2. Document types — matrix of doc_type × group with per-cell
 *                       read/edit toggles. The single place where doc
 *                       type access is configured.
 *   3. Groepen         — working-group CRUD, group membership, and
 *                       per-group policy_lead assignments.
 *
 * Admin-only — non-admins are kicked back to /dashboard before any
 * tab content renders. The single exception is /admin/groups, which
 * still allows policy_lead and policy_lead_department a read-only
 * view of their own groups; that page enforces the read-only mode
 * itself, so we let those roles pass the guard here.
 */
const TABS = [
  { slug: "users", label: "Personen" },
  { slug: "document-types", label: "Document types" },
  { slug: "groups", label: "Groepen" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            Manage people, document types and groups for the whole
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
