import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import type { Document } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: recent } = await supabase
    .from("documents")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(6);

  const { data: counts } = await supabase
    .from("documents")
    .select("status");
  const countByStatus = (counts ?? []).reduce<Record<string, number>>(
    (acc, d) => {
      acc[d.status] = (acc[d.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  // Last 7 days activity. The versions+profiles join cannot use the shim
  // (no PostgREST FK syntax), so it goes through raw SQL via withUser().
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const userId = await getCurrentUserId();
  const weekVersions = await withUser(userId, async (sql) => {
    return await sql<{
      id: string;
      created_at: string;
      author_id: string | null;
      author_full_name: string | null;
    }[]>`
      select v.id, v.created_at, v.author_id, p.full_name as author_full_name
        from public.document_versions v
        left join public.profiles p on p.id = v.author_id
       where v.created_at >= ${since}
    `;
  });

  const { data: weekComments } = await supabase
    .from("comments")
    .select("id,created_at,author_id")
    .gte("created_at", since);
  const { data: weekDocs } = await supabase
    .from("documents")
    .select("id,created_at")
    .gte("created_at", since);

  // Top contributors (last 7 days)
  const contribCount = new Map<string, { name: string; count: number }>();
  for (const v of weekVersions) {
    const id = v.author_id;
    if (!id) continue;
    const name = v.author_full_name ?? "Unknown";
    const cur = contribCount.get(id) ?? { name, count: 0 };
    cur.count += 1;
    cur.name = name;
    contribCount.set(id, cur);
  }
  const topContributors = Array.from(contribCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Recent activity across Volt policy documents.
          </p>
        </div>
        <Link
          href="/documents/new"
          className="rounded bg-volt-600 px-4 py-2 font-medium text-white hover:bg-volt-700"
        >
          + New document
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {["draft", "review", "approved", "archived"].map((s) => (
          <div key={s} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">{s}</div>
            <div className="mt-1 text-3xl font-bold">{countByStatus[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Stat label="New documents (7d)" value={(weekDocs ?? []).length} />
        <Stat label="Versions saved (7d)" value={weekVersions.length} />
        <Stat label="Comments (7d)" value={(weekComments ?? []).length} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">Recently updated</h2>
          <div className="mt-4 overflow-hidden rounded-lg border bg-white">
            {(recent as Document[] | null)?.length ? (
              <ul className="divide-y">
                {(recent as Document[]).map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/documents/${d.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.title}</div>
                        <div className="text-xs text-slate-500">
                          {d.document_type} · v{d.current_version} · updated{" "}
                          {formatDate(d.updated_at)}
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          d.status
                        )}`}
                      >
                        {d.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                No documents yet.
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Top contributors (7d)</h2>
          <div className="mt-4 overflow-hidden rounded-lg border bg-white">
            {topContributors.length ? (
              <ul className="divide-y">
                {topContributors.map((c, i) => (
                  <li
                    key={c.name + i}
                    className="flex items-center justify-between px-5 py-3 text-sm"
                  >
                    <span>{c.name}</span>
                    <span className="rounded bg-volt-50 px-2 py-0.5 text-xs font-medium text-volt-700">
                      {c.count} versions
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                No activity yet this week.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}
