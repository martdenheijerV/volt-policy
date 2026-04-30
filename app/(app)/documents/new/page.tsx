import Link from "next/link";
import { createClient } from "@/lib/db/client";
import MetadataField from "@/components/MetadataField";
import { createDocument } from "../actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import { DOC_TYPES, DOC_TYPE_LABELS } from "@/lib/doc-types";
import { withUser } from "@/lib/db/sql";
import { getCurrentUserId } from "@/lib/auth/server";

/**
 * Fetch every (group | department) the calling user is entitled to
 * publish into. Mirrors `can_publish_to_group` / `can_publish_to_department`
 * (migration 015):
 *   - admin → every group + every department
 *   - policy_lead → groups they lead
 *   - policy_lead_department → departments they lead
 *   - editor → groups & departments where they have can_edit
 *
 * We compute this in TS rather than as an SQL function because we need
 * to render names + ids in the form and SECURITY DEFINER booleans
 * don't return rows.
 */
async function getEligibleScopes(userId: string) {
  return await withUser(userId, async (sql) => {
    const groups = await sql<{ id: string; name: string }[]>`
      select g.id, g.name
        from public.user_groups g
       where public.is_admin()
          or exists (
            select 1 from public.user_group_leads ugl
            join public.profiles p on p.id = ugl.user_id
            where ugl.group_id = g.id
              and ugl.user_id = ${userId}::uuid
              and p.role = 'policy_lead'
          )
          or exists (
            select 1 from public.user_group_member_permissions ugmp
            where ugmp.group_id = g.id
              and ugmp.user_id = ${userId}::uuid
              and ugmp.can_edit
          )
       order by g.name
    `;
    const departments = await sql<{ id: string; name: string }[]>`
      select d.id, d.name
        from public.departments d
       where public.is_admin()
          or exists (
            select 1 from public.department_leads dl
            join public.profiles p on p.id = dl.user_id
            where dl.department_id = d.id
              and dl.user_id = ${userId}::uuid
              and p.role = 'policy_lead_department'
          )
          or exists (
            select 1 from public.department_member_permissions dmp
            where dmp.department_id = d.id
              and dmp.user_id = ${userId}::uuid
              and dmp.can_edit
          )
       order by d.name
    `;
    return { groups, departments };
  });
}

export default async function NewDocumentPage() {
  const db = await createClient();
  const { tr } = await getTr();
  const { data: fields } = await db
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");

  const userId = await getCurrentUserId();
  const { groups: scopeGroups, departments: scopeDepartments } = userId
    ? await getEligibleScopes(userId)
    : { groups: [], departments: [] };

  // Owner picker: admins and policy_leads can create a doc on behalf
  // of someone else; everyone else gets a single self-locked choice.
  const { data: me } = await db
    .from("profiles")
    .select("id,full_name,role")
    .eq("id", userId ?? "")
    .maybeSingle<{ id: string; full_name: string | null; role: string | null }>();
  const canPickOtherOwner =
    me?.role === "admin" ||
    me?.role === "policy_lead" ||
    me?.role === "policy_lead_department";
  const { data: ownerCandidates } = canPickOtherOwner
    ? await db
        .from("profiles")
        .select("id,full_name,role")
        .order("full_name")
    : { data: null };

  // Group fields: shown for all (applies_to null) vs per-type
  const universal = (fields ?? []).filter((f) => !f.applies_to);

  // Translate every doc-type label up front. tr() hits the dict cache
  // first (instant for languages we've already cached) and only goes to
  // DeepL for genuinely new strings — so this Promise.all is cheap on
  // warm caches and one-time pricey on cold ones.
  const typeLabelEntries = await Promise.all(
    DOC_TYPES.map(async (k) => [k, await tr(DOC_TYPE_LABELS[k])] as const)
  );
  const typeLabels = Object.fromEntries(typeLabelEntries) as Record<
    (typeof DOC_TYPES)[number],
    string
  >;

  const [
    purposePh,
    tagsPh,
    scopeLabel,
    scopeHint,
    scopeNoneEligible,
    scopeWorkingGroup,
    scopeDepartment,
    ownerLabel,
    ownerHint,
    ownerYou,
  ] = await Promise.all([
    tr("Why does this document exist?"),
    tr("climate, eu, trade (comma-separated)"),
    tr("Where does this document belong?"),
    tr(
      "Pick one. Members of the chosen scope will be able to read this draft; the scope's lead and any members with edit rights will be able to change it."
    ),
    tr(
      "You don't have edit rights in any group or department. Ask a lead to add you before creating a document."
    ),
    tr("Working group"),
    tr("Department"),
    tr("Owner"),
    tr(
      "The person responsible for this document. Defaults to you. Admins and leads can assign someone else."
    ),
    tr("you"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← <T>All documents</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        <T>New document</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>Prefix information is required before the first version can be saved.</T>
      </p>

      <form action={createDocument} className="mt-8 space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium">
            <T>Title</T> <span className="text-red-600">*</span>
          </label>
          <input
            id="title"
            name="title"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="document_type" className="block text-sm font-medium">
              <T>Type</T>
            </label>
            <select
              id="document_type"
              name="document_type"
              defaultValue="policy"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              {DOC_TYPES.map((k) => (
                <option key={k} value={k}>
                  {typeLabels[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="language" className="block text-sm font-medium">
              <T>Language</T>
            </label>
            <select
              id="language"
              name="language"
              defaultValue="en"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
              <option value="it">Italiano</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>

        {/*
          Scope picker. Required: documents.group_id XOR
          documents.department_id is enforced by a CHECK constraint
          (migration 015). The form composes a single hidden value
          "group:<id>" / "department:<id>" so an unselected radio
          doesn't leave both columns blank.

          A11y note: each option has a real label-pair (radio +
          select), with `aria-describedby` linking back to the
          fieldset's hint paragraph. The two selects are mutually
          exclusive; selecting one clears the other via the radio's
          `onChange` (handled with a tiny inline script, kept off
          the React tree to stay in a server component).
        */}
        <fieldset
          aria-describedby="scope-hint"
          className="space-y-3 rounded border border-slate-200 p-4"
        >
          <legend className="px-1 text-sm font-medium">
            {scopeLabel} <span className="text-red-600">*</span>
          </legend>
          <p id="scope-hint" className="text-xs text-slate-500">
            {scopeHint}
          </p>
          {scopeGroups.length === 0 && scopeDepartments.length === 0 ? (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {scopeNoneEligible}
            </p>
          ) : (
            <div className="space-y-2">
              {scopeGroups.length > 0 && (
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="scope_kind"
                    value="group"
                    defaultChecked
                    className="mt-1 h-4 w-4 border-slate-300"
                    aria-controls="scope-group-select"
                  />
                  <span className="flex-1">
                    <span className="text-sm font-medium">
                      {scopeWorkingGroup}
                    </span>
                    <select
                      id="scope-group-select"
                      name="scope_group_id"
                      className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                    >
                      {scopeGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              {scopeDepartments.length > 0 && (
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="scope_kind"
                    value="department"
                    defaultChecked={scopeGroups.length === 0}
                    className="mt-1 h-4 w-4 border-slate-300"
                    aria-controls="scope-department-select"
                  />
                  <span className="flex-1">
                    <span className="text-sm font-medium">{scopeDepartment}</span>
                    <select
                      id="scope-department-select"
                      name="scope_department_id"
                      className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
                    >
                      {scopeDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              {/*
                The form posts scope_kind + scope_group_id +
                scope_department_id as three loose fields. The server
                action picks the correct id based on scope_kind. No
                client-side JS needed — server-rendered <script> tags
                don't fire reliably during Next.js streaming so we
                used to lose the composed value before submit.
              */}
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium">
            <T>Purpose</T> <span className="text-red-600">*</span>
          </label>
          <textarea
            id="purpose"
            name="purpose"
            required
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={purposePh}
          />
        </div>

        {/*
          Owner picker. Defaults to the current user. Admins and
          policy_leads see a dropdown of every profile so they can
          assign the doc to someone else; everyone else gets a static
          read-only "Owner: you" label, and the server action falls
          back to user.id when no scope_owner_id is posted.
        */}
        <div>
          <label htmlFor="scope_owner_id" className="block text-sm font-medium">
            {ownerLabel}
          </label>
          {canPickOtherOwner && ownerCandidates ? (
            <>
              <select
                id="scope_owner_id"
                name="scope_owner_id"
                defaultValue={me?.id ?? ""}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                {ownerCandidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.full_name ?? p.id.slice(0, 8)) +
                      (p.id === me?.id ? ` (${ownerYou})` : "")}
                    {p.role ? ` — ${p.role}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">{ownerHint}</p>
            </>
          ) : (
            <p className="mt-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {me?.full_name ?? ownerYou}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium">
            <T>Tags</T>
          </label>
          <input
            id="tags"
            name="tags"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={tagsPh}
          />
        </div>

        {universal.length > 0 && (
          // Collapsible — default folded so the creation form stays
          // short. Users who want to enrich the doc with the seeded
          // baseline metadata (Geographic scope, Stakeholders, …)
          // expand by clicking. Server-side validation on `required`
          // fields still runs — if a required custom field is empty
          // on submit, the action returns "<label> is required" and
          // the user re-opens the section to fill it.
          <details className="space-y-3 rounded border border-slate-200 p-4">
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-slate-500">
              <T>Custom metadata</T>
            </summary>
            <p className="text-xs text-slate-500">
              <T>Per-type fields will appear after you save and edit the document.</T>
            </p>
            {universal.map((f) => (
              <MetadataField key={f.id} field={f} />
            ))}
          </details>
        )}

        {/*
          The "Initial content" textarea has been removed at Mart's
          request — every new doc starts with an empty editor and the
          user types there. The createDocument action no longer reads
          a `content` form field; it inserts an empty string into
          documents.current_content.

          The "Optional features" fieldset (citations opt-in checkbox)
          used to live below this block. Citations / Bronnen is now
          always-on; no toggle needed.
        */}

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-volt-600 px-5 py-2 font-medium text-white hover:bg-volt-700"
          >
            <T>Create document</T>
          </button>
          <Link
            href="/documents"
            className="rounded border border-slate-300 px-5 py-2 font-medium hover:bg-slate-50"
          >
            <T>Cancel</T>
          </Link>
        </div>
      </form>
    </div>
  );
}
