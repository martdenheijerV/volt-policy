import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";
import { getT } from "@/lib/i18n/server";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import { docTypeLabel } from "@/lib/doc-types";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import type { Document } from "@/lib/types";

export default async function DashboardPage() {
  const { t, lang } = await getT();
  const supabase = await createClient();

  // Logged-in user + profile (so we can show their language preference
  // and group memberships in this dashboard, the user's "home base").
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("id,full_name,role,language_pref")
        .eq("id", user.id)
        .maybeSingle<{
          id: string;
          full_name: string | null;
          role: string | null;
          language_pref: string;
        }>()
    : { data: null };

  // Group memberships: which groups is the user IN, and what permission
  // rules attach to those groups? Raw SQL because the shim doesn't handle
  // the multi-table join cleanly. RLS-safe because we run with user
  // context — if the user can't read user_group_members rows, they get
  // back nothing rather than someone else's data.
  const userId = user?.id ?? null;
  const myGroups = userId
    ? await withUser(userId, async (sql) => {
        return await sql<{
          group_id: string;
          name: string;
          description: string | null;
          rules_json: string | null;
        }[]>`
          select g.id   as group_id,
                 g.name as name,
                 g.description as description,
                 (
                   select coalesce(
                     json_agg(
                       json_build_object(
                         'document_type', p.document_type,
                         'status', p.status,
                         'can_read', p.can_read,
                         'can_edit', p.can_edit,
                         'can_comment', p.can_comment,
                         'can_approve', p.can_approve
                       )
                     ),
                     '[]'::json
                   )::text
                   from public.group_doc_permissions p
                   where p.group_id = g.id
                 ) as rules_json
            from public.user_group_members m
            join public.user_groups g on g.id = m.group_id
           where m.user_id = ${userId}
           order by g.name
        `;
      })
    : [];

  // Edit-rights requests, both directions:
  //   * myPendingRequests = ones I filed, waiting on someone
  //   * incomingRequests  = ones I can decide (admin OR doc owner OR
  //                          can_approve_doc), filtered by RLS so this
  //                          user only sees their own decisions queue
  //
  // Wrapped in try/catch because the table might not exist yet on a
  // stale deploy that hasn't run migration 008. We skip the sections
  // silently in that case.
  let myPendingRequests: {
    id: string;
    document_id: string;
    document_title: string;
    created_at: string;
  }[] = [];
  let incomingRequests: {
    id: string;
    document_id: string;
    document_title: string;
    requester_name: string | null;
    message: string | null;
    created_at: string;
  }[] = [];
  if (userId) {
    try {
      myPendingRequests = await withUser(userId, async (sql) => {
        return await sql<{
          id: string;
          document_id: string;
          document_title: string;
          created_at: string;
        }[]>`
          select r.id,
                 r.document_id,
                 d.title as document_title,
                 r.created_at
            from public.edit_rights_requests r
            join public.documents d on d.id = r.document_id
           where r.requester_id = ${userId}
             and r.status = 'pending'
           order by r.created_at desc
        `;
      });
    } catch {
      myPendingRequests = [];
    }
    try {
      incomingRequests = await withUser(userId, async (sql) => {
        // RLS already filters to rows this user can decide. We additionally
        // exclude self-requests from the inbox so the same row doesn't
        // appear in both lists.
        return await sql<{
          id: string;
          document_id: string;
          document_title: string;
          requester_name: string | null;
          message: string | null;
          created_at: string;
        }[]>`
          select r.id,
                 r.document_id,
                 d.title as document_title,
                 coalesce(p.full_name, r.requester_name_cached) as requester_name,
                 r.message,
                 r.created_at
            from public.edit_rights_requests r
            join public.documents d on d.id = r.document_id
            left join public.profiles p on p.id = r.requester_id
           where r.status = 'pending'
             and r.requester_id <> ${userId}
           order by r.created_at desc
        `;
      });
    } catch {
      incomingRequests = [];
    }
  }

  // "Te reviewen" inbox: documents currently in status='review' that
  // this user can approve. Admin sees all; the doc owner sees their
  // own; policy_lead sees the ones their group permission rules allow.
  // Resolved server-side per-row by calling can_approve_doc — small
  // queue so the per-row call is cheap.
  let toReview: {
    id: string;
    title: string;
    document_type: string;
    review_version_number: number | null;
    pending_change_summary: string | null;
    updated_at: string;
  }[] = [];
  if (userId) {
    try {
      toReview = await withUser(userId, async (sql) => {
        return await sql<{
          id: string;
          title: string;
          document_type: string;
          review_version_number: number | null;
          pending_change_summary: string | null;
          updated_at: string;
        }[]>`
          select d.id,
                 d.title,
                 d.document_type::text,
                 d.review_version_number,
                 d.pending_change_summary,
                 d.updated_at
            from public.documents d
           where d.status = 'review'
             and (
               coalesce((select role = 'admin' from public.profiles where id = ${userId}), false)
               or d.owner_id = ${userId}
               or public.can_approve_doc(d.id)
             )
           order by d.updated_at desc
        `;
      });
    } catch {
      toReview = [];
    }
  }

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
  const sqlUserId = await getCurrentUserId();
  const weekVersions = await withUser(sqlUserId, async (sql) => {
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

  const statusKey: Record<string, string> = {
    draft: "doc.statusDraft",
    review: "doc.statusReview",
    approved: "doc.statusApproved",
    archived: "doc.statusArchived",
  };

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("nav.dashboard")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          href="/documents/new"
          className="rounded bg-volt-600 px-4 py-2 font-medium text-white hover:bg-volt-700"
        >
          {t("doc.new")}
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        {["draft", "review", "approved", "archived"].map((s) => (
          <div key={s} className="rounded-lg border bg-white p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              {t(statusKey[s])}
            </div>
            <div className="mt-1 text-3xl font-bold">{countByStatus[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Stat label={t("dashboard.newDocs")} value={(weekDocs ?? []).length} />
        <Stat label={t("dashboard.versionsSaved")} value={weekVersions.length} />
        <Stat label={t("dashboard.commentsCount")} value={(weekComments ?? []).length} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold">{t("dashboard.recentlyUpdated")}</h2>
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
                          {docTypeLabel(d.document_type)} · v{d.current_version} ·{" "}
                          {t("dashboard.updated")} {formatDate(d.updated_at)}
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          d.status
                        )}`}
                      >
                        {t(statusKey[d.status] ?? d.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                {t("dashboard.noDocs")}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">{t("dashboard.topContributors")}</h2>
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
                      {c.count} {t("dashboard.versions")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                {t("dashboard.noActivity")}
              </div>
            )}
          </div>
        </section>
      </div>

      {/*
        Personal panel: language preference + group memberships + open
        edit-rights requests. Lives below the activity blocks because
        when nothing has happened recently it's nice to still have your
        own settings & access overview at a glance.
      */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="prefs-heading"
          className="rounded-lg border bg-white p-5"
        >
          <h2 id="prefs-heading" className="text-xl font-semibold">
            {t("dashboard.prefsHeading")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("dashboard.prefsSubtitle")}
          </p>
          <div className="mt-4 flex items-center gap-3">
            <label
              htmlFor="dashboard-base-language"
              className="text-sm font-medium"
            >
              {t("dashboard.baseLanguage")}
            </label>
            {/*
              Reuses the same client switcher the nav uses. It POSTs to
              /api/lang which writes profile.language_pref + sets the
              cookie. router.refresh() reloads the dashboard with the
              new translations applied.
            */}
            <LanguageSwitcher value={profile?.language_pref ?? lang} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {t("dashboard.baseLanguageHint")}
          </p>
        </section>

        <section
          aria-labelledby="groups-heading"
          className="rounded-lg border bg-white p-5"
        >
          <h2 id="groups-heading" className="text-xl font-semibold">
            {t("dashboard.myGroupsHeading")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("dashboard.myGroupsSubtitle")}
          </p>
          {myGroups.length === 0 ? (
            <div className="mt-4 rounded border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              {t("dashboard.myGroupsEmpty")}
            </div>
          ) : (
            <ul className="mt-4 divide-y rounded border">
              {myGroups.map((g) => {
                let rules: GroupRule[] = [];
                try {
                  rules = JSON.parse(g.rules_json ?? "[]") as GroupRule[];
                } catch {
                  rules = [];
                }
                return (
                  <li key={g.group_id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{g.name}</div>
                        {g.description && (
                          <div className="text-xs text-slate-500">
                            {g.description}
                          </div>
                        )}
                      </div>
                      {/* Admins / policy_leads can navigate into the
                          group page; regular members just see the rule
                          summary. */}
                      {(profile?.role === "admin" ||
                        profile?.role === "policy_lead") && (
                        <Link
                          href={`/admin/groups/${g.group_id}`}
                          className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                        >
                          {t("dashboard.openGroup")}
                        </Link>
                      )}
                    </div>
                    {rules.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rules.map((r, i) => (
                          <span
                            key={i}
                            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {ruleSummary(r, t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {myPendingRequests.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700">
                {t("dashboard.pendingEditRequestsHeading")}
              </h3>
              <ul className="mt-2 divide-y rounded border">
                {myPendingRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <Link
                      href={`/documents/${r.document_id}`}
                      className="text-volt-700 hover:underline"
                    >
                      {r.document_title}
                    </Link>
                    <span className="text-xs text-slate-500">
                      {formatDate(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                {t("dashboard.pendingEditRequestsHint")}
              </p>
            </div>
          )}
        </section>
      </div>

      {/*
        Approver inboxes — two separate streams that approvers care
        about, both shown side-by-side for consistency:

         * "Te reviewen" — documents in status='review' that this user
           can approve. Click → the doc, where Approve / Reject lives.

         * "Aanvragen die op jouw beslissing wachten" — edit-rights
           requests this user can decide.

        Both are always rendered (with an empty state) so the user
        sees these queues exist even when nothing's waiting.
      */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="to-review-heading"
          className="rounded-lg border border-amber-300 bg-amber-50 p-5"
        >
          <h2
            id="to-review-heading"
            className="text-xl font-semibold text-amber-900"
          >
            {t("dashboard.toReviewHeading")}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            {t("dashboard.toReviewSubtitle")}
          </p>
          {toReview.length === 0 ? (
            <div className="mt-4 rounded border border-dashed border-amber-300 bg-white p-4 text-sm text-slate-500">
              {t("dashboard.toReviewEmpty")}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-amber-200 rounded border border-amber-200 bg-white">
              {toReview.map((d) => (
                <li key={d.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/documents/${d.id}`}
                        className="font-medium text-volt-700 hover:underline"
                      >
                        {d.title}
                      </Link>
                      <div className="text-xs text-slate-600">
                        {docTypeLabel(d.document_type)}
                        {d.review_version_number
                          ? ` · v${d.review_version_number}`
                          : ""}
                        {" · "}
                        {t("dashboard.updated")} {formatDate(d.updated_at)}
                      </div>
                      {d.pending_change_summary && (
                        <p className="mt-1 italic text-slate-700">
                          “{d.pending_change_summary}”
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/documents/${d.id}`}
                      className="shrink-0 rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      {t("dashboard.openForReview")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="incoming-heading"
          className="rounded-lg border border-amber-300 bg-amber-50 p-5"
        >
          <h2
            id="incoming-heading"
            className="text-xl font-semibold text-amber-900"
          >
            {t("dashboard.incomingRequestsHeading")}
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            {t("dashboard.incomingRequestsSubtitle")}
          </p>
          {incomingRequests.length === 0 ? (
            <div className="mt-4 rounded border border-dashed border-amber-300 bg-white p-4 text-sm text-slate-500">
              {t("dashboard.incomingRequestsEmpty")}
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-amber-200 rounded border border-amber-200 bg-white">
              {incomingRequests.map((r) => (
                <li key={r.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/documents/${r.document_id}`}
                        className="font-medium text-volt-700 hover:underline"
                      >
                        {r.document_title}
                      </Link>
                      <div className="text-xs text-slate-600">
                        {(t("dashboard.incomingRequestRowTpl"))
                          .replace("{name}", r.requester_name ?? "—")
                          .replace("{date}", formatDate(r.created_at))}
                      </div>
                      {r.message && (
                        <p className="mt-1 italic text-slate-700">
                          “{r.message}”
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/documents/${r.document_id}`}
                      className="shrink-0 rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      {t("dashboard.decideOnDoc")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

interface GroupRule {
  document_type: string | null;
  status: string | null;
  can_read: boolean;
  can_edit: boolean;
  can_comment: boolean;
  can_approve: boolean;
}

/**
 * One-line summary of a group permission rule. Kept tiny on purpose —
 * the dashboard is a glance, the full table lives on the group detail
 * page.
 */
function ruleSummary(r: GroupRule, t: (k: string) => string): string {
  const scope =
    r.document_type && r.status
      ? `${r.document_type} · ${r.status}`
      : r.document_type
      ? r.document_type
      : r.status
      ? r.status
      : t("dashboard.allDocs");
  const verbs: string[] = [];
  if (r.can_approve) verbs.push(t("dashboard.verbApprove"));
  if (r.can_edit) verbs.push(t("dashboard.verbEdit"));
  if (r.can_comment) verbs.push(t("dashboard.verbComment"));
  if (r.can_read) verbs.push(t("dashboard.verbRead"));
  return `${scope}: ${verbs.join(", ") || "—"}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
    </div>
  );
}
