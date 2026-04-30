import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import UserRow, { type UserRowLabels } from "./UserRow";
import AddExternalUserForm, {
  type AddExternalUserFormLabels,
} from "./AddExternalUserForm";
import DepartmentsCard, {
  type DepartmentsCardLabels,
} from "./DepartmentsCard";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import type { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
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

  if (me?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  // Departments + lead assignments for the Departments card. Two
  // round-trips kept separate so a slow leads query doesn't block
  // the users table — both happen in parallel below.
  const [{ data: departments }, { data: leads }] = await Promise.all([
    supabase
      .from("departments")
      .select("id,name,description")
      .order("name"),
    supabase.from("department_leads").select("department_id,user_id"),
  ]);

  const leadsByDept = new Map<string, string[]>();
  for (const l of leads ?? []) {
    const arr = leadsByDept.get(l.department_id) ?? [];
    arr.push(l.user_id);
    leadsByDept.set(l.department_id, arr);
  }
  const deptsWithLeads = (departments ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    leadIds: leadsByDept.get(d.id) ?? [],
  }));

  const [
    nameCol,
    roleCol,
    languageCol,
    createdCol,
    actionsCol,
    rowLabels,
    formLabels,
    deptLabels,
  ] = await Promise.all([
    tr("Name"),
    tr("Role"),
    tr("Language"),
    tr("Created"),
    tr("Actions"),
    buildUserRowLabels(tr),
    buildAddExternalUserLabels(tr),
    buildDepartmentsLabels(tr),
  ]);

  return (
    <div>
      {/*
        No local <h1> here — the /admin layout provides the "Beheer"
        page heading and the tab strip above this content. Each tab's
        page is just its body.
      */}
      <p className="text-sm text-slate-600">
        <T>
          Change user roles, invite external users, and manage the
          department layer (organisational units). Admins can manage all
          documents; editors create and edit; members read review/approved
          docs and comment; translators work on translations; policy leads
          and policy_lead_department leads have scoped rights.
        </T>
      </p>

      <div className="mt-6">
        <AddExternalUserForm labels={formLabels} />
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">{nameCol}</th>
              <th className="px-4 py-3">{roleCol}</th>
              <th className="px-4 py-3">{languageCol}</th>
              <th className="px-4 py-3">{createdCol}</th>
              <th className="px-4 py-3">{actionsCol}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(profiles as Profile[] | null)?.map((p) => (
              <UserRow key={p.id} profile={p} labels={rowLabels} />
            ))}
          </tbody>
        </table>
      </div>

      <DepartmentsCard
        departments={deptsWithLeads}
        people={(profiles as Profile[] | null) ?? []}
        labels={deptLabels}
      />
    </div>
  );
}

async function buildUserRowLabels(
  tr: (s: string) => Promise<string>
): Promise<UserRowLabels> {
  const [
    unnamed,
    deleteLabel,
    deleteConfirmTpl,
    deleteConfirmBody,
    keepName,
    anonymize,
    cancel,
    failedToUpdateRole,
    failed,
    fallbackUser,
  ] = await Promise.all([
    tr("Unnamed"),
    tr("Delete"),
    tr("Delete {name}?"),
    tr(
      "Their comments stay for the audit trail. Choose how to handle their name:"
    ),
    tr("Keep name"),
    tr("Anonymize"),
    tr("Cancel"),
    tr("Failed to update role"),
    tr("Failed"),
    tr("user"),
  ]);
  return {
    unnamed,
    delete: deleteLabel,
    deleteConfirmHeadingTpl: deleteConfirmTpl,
    deleteConfirmBody,
    keepName,
    anonymize,
    cancel,
    failedToUpdateRole,
    failed,
    fallbackUser,
  };
}

async function buildAddExternalUserLabels(
  tr: (s: string) => Promise<string>
): Promise<AddExternalUserFormLabels> {
  const [
    openButton,
    successHeading,
    successBody,
    loginUrl,
    username,
    tempPassword,
    firstLoginNote,
    close,
    addAnother,
    formHeading,
    formIntro,
    name,
    namePlaceholder,
    email,
    emailPlaceholder,
    role,
    roleMember,
    roleEditor,
    rolePolicyLead,
    rolePolicyLeadDepartment,
    roleTranslator,
    roleAdmin,
    creating,
    create,
    cancel,
  ] = await Promise.all([
    tr("Add external user"),
    tr("External user created"),
    tr(
      "Forward these credentials. The password is shown only once. The recipient goes to the Login URL and signs in directly with username + temporary password (no \"Continue with Volt Auth\" button needed — that's for SSO users)."
    ),
    tr("Login URL"),
    tr("Username"),
    tr("Temporary password"),
    tr("On first login the user must change their password via Authentik."),
    tr("Close"),
    tr("Add another user"),
    tr("Add external user"),
    tr(
      "For people who aren't in a Volt SSO directory. They get an Authentik account with a temporary password and can sign in with it."
    ),
    tr("Name"),
    tr("First and last name"),
    tr("Email address"),
    tr("name@example.org"),
    tr("Role"),
    tr("Member (read + comment only)"),
    tr("Editor (create + edit)"),
    tr("Policy lead (edit + approve scoped to a group)"),
    tr("Policy lead — department (full rights inside their department)"),
    tr("Translator (translation work)"),
    tr("Admin (oversight + approve)"),
    tr("Creating…"),
    tr("Create"),
    tr("Cancel"),
  ]);
  return {
    openButton,
    successHeading,
    successBody,
    loginUrl,
    username,
    tempPassword,
    firstLoginNote,
    close,
    addAnother,
    formHeading,
    formIntro,
    name,
    namePlaceholder,
    email,
    emailPlaceholder,
    role,
    roleMember,
    roleEditor,
    rolePolicyLead,
    rolePolicyLeadDepartment,
    roleTranslator,
    roleAdmin,
    creating,
    create,
    cancel,
  };
}

async function buildDepartmentsLabels(
  tr: (s: string) => Promise<string>
): Promise<DepartmentsCardLabels> {
  const [
    heading,
    intro,
    newDeptName,
    description,
    namePlaceholder,
    add,
    noDepts,
    leadsHeading,
    noLeads,
    pickLead,
    assign,
    remove,
    warningWrongRole,
    deleteLabel,
    confirmDeleteTpl,
    failed,
  ] = await Promise.all([
    tr("Departments"),
    tr(
      "Organisational units (Volt Europa, Volt EP, Volt Nederland, etc.). Each department can have one or more policy leads — admins assign them here. Leads need the role policy_lead_department to actually exercise their rights; an amber warning appears next to anyone whose role doesn't match yet."
    ),
    tr("New department name"),
    tr("Description"),
    tr("e.g. Volt Berlin"),
    tr("Add"),
    tr("No departments yet."),
    tr("Department leads"),
    tr("No leads assigned yet."),
    tr("Pick a person…"),
    tr("Assign"),
    tr("Remove"),
    tr(
      "This user is assigned as lead but doesn't have the role policy_lead_department yet. Assignment grants no rights until the role is set on the Personen tab above."
    ),
    tr("Delete"),
    tr("Delete department {name}? Lead assignments will be removed too."),
    tr("Failed"),
  ]);
  return {
    heading,
    intro,
    newDeptName,
    description,
    namePlaceholder,
    add,
    noDepts,
    leadsHeading,
    noLeads,
    pickLead,
    assign,
    remove,
    warningWrongRole,
    delete: deleteLabel,
    confirmDeleteTpl,
    failed,
  };
}
