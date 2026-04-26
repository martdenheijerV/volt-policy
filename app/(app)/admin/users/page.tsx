import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import UserRow from "./UserRow";
import type { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
  const supabase = await createClient();
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

  return (
    <div>
      <h1 className="text-3xl font-bold">User management</h1>
      <p className="mt-1 text-sm text-slate-600">
        Change user roles. Admins can manage all documents; editors can create
        and edit; members can comment on review/approved documents;
        translators work on translations.
      </p>

      <div className="mt-6 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Language</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(profiles as Profile[] | null)?.map((p) => (
              <UserRow key={p.id} profile={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
