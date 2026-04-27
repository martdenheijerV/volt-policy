import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import UserRow, { type UserRowLabels } from "./UserRow";
import AddExternalUserForm, {
  type AddExternalUserFormLabels,
} from "./AddExternalUserForm";
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

  const [
    nameCol,
    roleCol,
    languageCol,
    createdCol,
    actionsCol,
    rowLabels,
    formLabels,
  ] = await Promise.all([
    tr("Name"),
    tr("Role"),
    tr("Language"),
    tr("Created"),
    tr("Actions"),
    buildUserRowLabels(tr),
    buildAddExternalUserLabels(tr),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold">
        <T>User management</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Change user roles. Admins can manage all documents; editors can
          create and edit; members can comment on review/approved documents;
          translators work on translations.
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
    roleTranslator,
    roleAdmin,
    creating,
    create,
    cancel,
  };
}
