import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { createGroup } from "./actions";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: groups } = await supabase
    .from("user_groups")
    .select("id,name,description,created_at")
    .order("name");

  return (
    <div>
      <h1 className="text-3xl font-bold">User groups</h1>
      <p className="mt-1 text-sm text-slate-600">
        Group members get default read/edit/comment permissions across documents
        of certain types or statuses.
      </p>

      <form action={createGroup} className="mt-6 flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <div className="flex-1">
          <label htmlFor="name" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            New group name
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="e.g. Climate working group"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="description" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
            Description
          </label>
          <input
            id="description"
            name="description"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700">
          Create
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
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
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
            {(groups ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-sm text-slate-500">
                  No groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
