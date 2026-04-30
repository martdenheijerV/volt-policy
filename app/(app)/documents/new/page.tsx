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
    contentPh,
    optionalFeaturesLabel,
    citationsLabel,
    citationsHint,
    scopeLabel,
    scopeHint,
    scopeNoneEligible,
    scopeWorkingGroup,
    scopeDepartment,
  ] = await Promise.all([
    tr("Why does this document exist?"),
    tr("climate, eu, trade (comma-separated)"),
    tr("# Heading\n\nYour policy text…"),
    tr("Optional features"),
    tr("Enable citations / bibliography"),
    tr(
      "Adds a Citations tab to this document. After saving, open the document and find Citations in the ⋯ menu to add sources — then reference them in the body with [@cite_key]. Most docs don't need this; leave off for plain hyperlink references."
    ),
    tr("Where does this document belong?"),
    tr(
      "Pick one. Members of the chosen scope will be able to read this draft; the scope's lead and any members with edit rights will be able to change it."
    ),
    tr(
      "You don't have edit rights in any group or department. Ask a lead to add you before creating a document."
    ),
    tr("Working group"),
    tr("Department"),
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
                Hidden synthetic field. Submit-time inline script
                rewrites it to "group:<id>" or "department:<id>"
                based on the selected radio. Keeps the server action
                code untouched of dual-branch parsing logic.
              */}
              <input type="hidden" name="scope" id="scope-composed" />
              <script
                dangerouslySetInnerHTML={{
                  __html: `
                  (function(){
                    var f = document.currentScript.closest('form');
                    if (!f) return;
                    f.addEventListener('submit', function(){
                      var kind = f.querySelector('input[name="scope_kind"]:checked');
                      var k = kind ? kind.value : '';
                      var sel = f.querySelector(k === 'group' ? '#scope-group-select' : '#scope-department-select');
                      var composed = f.querySelector('#scope-composed');
                      if (sel && composed) composed.value = k + ':' + sel.value;
                    });
                  })();
                `,
                }}
              />
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium">
            <T>Purpose</T>
          </label>
          <textarea
            id="purpose"
            name="purpose"
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={purposePh}
          />
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
          <fieldset className="space-y-3 rounded border border-slate-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <T>Custom metadata</T>
            </legend>
            <p className="text-xs text-slate-500">
              <T>Per-type fields will appear after you save and edit the document.</T>
            </p>
            {universal.map((f) => (
              <MetadataField key={f.id} field={f} />
            ))}
          </fieldset>
        )}

        <div>
          <label htmlFor="content" className="block text-sm font-medium">
            <T>Initial content (Markdown or rich text)</T>
          </label>
          <textarea
            id="content"
            name="content"
            rows={10}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder={contentPh}
          />
        </div>

        {/*
          Optional features sit after the content field so the form
          flows in order of importance: title → type/lang → purpose →
          tags → custom metadata → content → optional add-ons. By the
          time the editor reaches this fieldset they've made the
          content decisions; toggling 'Enable citations' here just
          decorates an already-written doc.
        */}
        <fieldset className="space-y-2 rounded border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {optionalFeaturesLabel}
          </legend>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="citations_enabled"
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              <span className="font-medium">{citationsLabel}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {citationsHint}
              </span>
            </span>
          </label>
        </fieldset>

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
