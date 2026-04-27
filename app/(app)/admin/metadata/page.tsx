import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { createMetadataField, deleteMetadataField } from "./actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

export default async function MetadataAdminPage() {
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
  if (me?.role !== "admin") redirect("/dashboard");

  const { data: fields } = await supabase
    .from("metadata_fields")
    .select("*")
    .order("display_order");

  const [
    keyLabel,
    keyPlaceholder,
    displayLabel,
    displayLabelPlaceholder,
    typeLabel,
    typeText,
    typeNumber,
    typeDate,
    typeSelect,
    typeBoolean,
    appliesToLabel,
    allTypes,
    typePolicy,
    typePosition,
    typeResolution,
    typeStatement,
    typeMotion,
    typeOther,
    choicesLabel,
    choicesPlaceholder,
    requiredLabel,
    addField,
    keyCol,
    labelCol,
    typeCol,
    appliesCol,
    requiredCol,
    deleteLabel,
    noFields,
  ] = await Promise.all([
    tr("Key (snake_case)"),
    tr("campaign_id"),
    tr("Display label"),
    tr("Campaign ID"),
    tr("Type"),
    tr("Text"),
    tr("Number"),
    tr("Date"),
    tr("Select (choices)"),
    tr("Boolean"),
    tr("Applies to"),
    tr("All types"),
    tr("Policy"),
    tr("Position"),
    tr("Resolution"),
    tr("Statement"),
    tr("Motion"),
    tr("Other"),
    tr("Choices (comma-separated, only for Select)"),
    tr("EU, National, Local"),
    tr("Required"),
    tr("Add field"),
    tr("Key"),
    tr("Label"),
    tr("Type"),
    tr("Applies to"),
    tr("Required"),
    tr("Delete"),
    tr("No custom fields yet."),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold">
        <T>Custom metadata fields</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Add organization-specific fields that appear on every document of the
          chosen type. Stored in document_metadata_values.
        </T>
      </p>

      <form
        action={createMetadataField}
        className="mt-6 grid gap-3 rounded border bg-white p-4 sm:grid-cols-3"
      >
        <div>
          <label htmlFor="key" className="block text-xs uppercase tracking-wider text-slate-500">
            {keyLabel}
          </label>
          <input
            id="key"
            name="key"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={keyPlaceholder}
          />
        </div>
        <div>
          <label htmlFor="label" className="block text-xs uppercase tracking-wider text-slate-500">
            {displayLabel}
          </label>
          <input
            id="label"
            name="label"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={displayLabelPlaceholder}
          />
        </div>
        <div>
          <label htmlFor="field_type" className="block text-xs uppercase tracking-wider text-slate-500">
            {typeLabel}
          </label>
          <select id="field_type" name="field_type" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="text">{typeText}</option>
            <option value="number">{typeNumber}</option>
            <option value="date">{typeDate}</option>
            <option value="select">{typeSelect}</option>
            <option value="boolean">{typeBoolean}</option>
          </select>
        </div>
        <div>
          <label htmlFor="applies_to" className="block text-xs uppercase tracking-wider text-slate-500">
            {appliesToLabel}
          </label>
          <select id="applies_to" name="applies_to" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">{allTypes}</option>
            <option value="policy">{typePolicy}</option>
            <option value="position">{typePosition}</option>
            <option value="resolution">{typeResolution}</option>
            <option value="statement">{typeStatement}</option>
            <option value="motion">{typeMotion}</option>
            <option value="other">{typeOther}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="options" className="block text-xs uppercase tracking-wider text-slate-500">
            {choicesLabel}
          </label>
          <input
            id="options"
            name="options"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={choicesPlaceholder}
          />
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="required" />
          {requiredLabel}
        </label>
        <button type="submit" className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 sm:col-span-3">
          {addField}
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">{keyCol}</th>
              <th className="px-4 py-3">{labelCol}</th>
              <th className="px-4 py-3">{typeCol}</th>
              <th className="px-4 py-3">{appliesCol}</th>
              <th className="px-4 py-3">{requiredCol}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(fields ?? []).map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2 font-mono">{f.key}</td>
                <td className="px-4 py-2">{f.label}</td>
                <td className="px-4 py-2 capitalize">{f.field_type}</td>
                <td className="px-4 py-2">{f.applies_to ?? "all"}</td>
                <td className="px-4 py-2">{f.required ? "✓" : ""}</td>
                <td className="px-4 py-2 text-right">
                  <form action={async () => { "use server"; await deleteMetadataField(f.id); }}>
                    <button className="text-xs text-red-700 hover:underline">{deleteLabel}</button>
                  </form>
                </td>
              </tr>
            ))}
            {(fields ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-slate-500">
                  {noFields}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
