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
import GroupActions from "./GroupActions";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    .select("id,document_type,status,can_read,can_edit,can_comment")
    .eq("group_id", id)
    .order("created_at");

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id,full_name,role")
    .order("full_name");

  return (
    <div>
      <Link href="/admin/groups" className="text-sm text-slate-500 hover:underline">
        ← All groups
      </Link>
      <h1 className="mt-2 text-3xl font-bold">{group.name}</h1>
      {group.description && <p className="mt-1 text-slate-600">{group.description}</p>}

      <GroupActions
        groupId={group.id}
        allProfiles={allProfiles ?? []}
        memberIds={members.map((m) => m.user_id)}
      />

      <h2 className="mt-8 text-xl font-semibold">Members</h2>
      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  {m.full_name ?? <em className="text-slate-400">Unknown</em>}
                </td>
                <td className="px-4 py-2 text-slate-500 capitalize">{m.role}</td>
                <td className="px-4 py-2 text-right">
                  <form action={async () => { "use server"; await removeMember(group.id, m.user_id); }}>
                    <button className="text-xs text-red-700 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td className="p-4 text-center text-sm text-slate-500">No members</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-semibold">Permission rules</h2>
      <p className="mt-1 text-sm text-slate-600">
        Each rule says: members of this group get the checked permissions on
        documents matching the chosen type and status (leave blank = any).
      </p>

      <form action={addGroupPermission} className="mt-3 flex flex-wrap items-end gap-3 rounded border bg-white p-4">
        <input type="hidden" name="group_id" value={group.id} />
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">Type</label>
          <select name="document_type" className="mt-1 rounded border border-slate-300 px-2 py-1">
            <option value="">Any</option>
            <option value="policy">Policy</option>
            <option value="position">Position</option>
            <option value="resolution">Resolution</option>
            <option value="statement">Statement</option>
            <option value="motion">Motion</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-500">Status</label>
          <select name="status" className="mt-1 rounded border border-slate-300 px-2 py-1">
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_read" defaultChecked /> Read
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_comment" defaultChecked /> Comment
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="can_edit" /> Edit
        </label>
        <button type="submit" className="rounded bg-volt-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-volt-700">
          Add rule
        </button>
      </form>

      <div className="mt-3 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Read</th>
              <th className="px-4 py-2">Comment</th>
              <th className="px-4 py-2">Edit</th>
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
                <td className="px-4 py-2 text-right">
                  <form action={async () => { "use server"; await deleteGroupPermission(r.id, group.id); }}>
                    <button className="text-xs text-red-700 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
            {(permissions ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-sm text-slate-500">
                  No rules yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={async () => { "use server"; await deleteGroup(group.id); redirect("/admin/groups"); }} className="mt-10">
        <button className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          Delete group
        </button>
      </form>
    </div>
  );
}
