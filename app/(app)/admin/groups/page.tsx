import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { createGroup } from "./actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

export default async function GroupsPage() {
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
  // Admin and policy_lead get access. Admin sees + edits everything;
  // policy_lead sees the groups they are a member of (read-only) so they
  // can navigate into the groups they steward without admin scaffolding.
  const isAdmin = me?.role === "admin";
  const isPolicyLead = me?.role === "policy_lead";
  if (!isAdmin && !isPolicyLead) redirect("/dashboard");

  let groups: { id: string; name: string; description: string | null; created_at: string }[] | null = null;
  if (isAdmin) {
    const { data } = await supabase
      .from("user_groups")
      .select("id,name,description,created_at")
      .order("name");
    groups = data;
  } else {
    // Policy_lead: only show groups this user is in. We get their
    // group_ids first, then look up the groups themselves. The shim
    // doesn't support .in() reliably with empty arrays, so we guard.
    const { data: memberships } = await supabase
      .from("user_group_members")
      .select("group_id")
      .eq("user_id", user?.id ?? "");
    const groupIds = (memberships ?? []).map((m) => m.group_id);
    if (groupIds.length > 0) {
      const { data } = await supabase
        .from("user_groups")
        .select("id,name,description,created_at")
        .in("id", groupIds)
        .order("name");
      groups = data;
    } else {
      groups = [];
    }
  }

  const [
    newGroupName,
    description,
    namePlaceholder,
    create,
    nameCol,
    descCol,
    manage,
    noGroups,
  ] = await Promise.all([
    tr("New group name"),
    tr("Description"),
    tr("e.g. Climate working group"),
    tr("Create"),
    tr("Name"),
    tr("Description"),
    tr("Manage"),
    tr("No groups yet."),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold">
        <T>User groups</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Group members get default read/edit/comment permissions across
          documents of certain types or statuses.
        </T>
      </p>

      {isAdmin && (
      <form action={createGroup} className="mt-6 flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <div className="flex-1">
          <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            {newGroupName}
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={namePlaceholder}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="description" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            {description}
          </label>
          <input
            id="description"
            name="description"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700">
          {create}
        </button>
      </form>
      )}

      <div className="mt-8 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">{nameCol}</th>
              <th className="px-4 py-3">{descCol}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(groups ?? []).map((g) => (
              <tr key={g.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{g.name}</td>
                <td className="px-4 py-3 text-slate-600">{g.description ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/groups/${g.id}`}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    {manage}
                  </Link>
                </td>
              </tr>
            ))}
            {(groups ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-sm text-slate-500">
                  {noGroups}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
