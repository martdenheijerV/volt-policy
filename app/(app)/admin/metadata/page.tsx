import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { createMetadataField, deleteMetadataField } from "./actions";

export default async function MetadataAdminPage() {
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

  const { data: fields } = await supabase
    .from("metadata_fields")
    .select("*")
    .order("display_order");

  return (
    <div>
      <h1 className="text-3xl font-bold">Custom metadata fields</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add organization-specific fields that appear on every document of the
        chosen type. Stored in <code>document_metadata_values</code>.
      </p>

      <form
        action={createMetadataField}
        className="mt-6 grid gap-3 rounded border bg-white p-4 sm:grid-cols-3"
      >
        <div>
          <label htmlFor="key" className="block text-xs uppercase tracking-wider text-slate-500">
            Key (snake_case)
          </label>
          <input
            id="key"
            name="key"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="campaign_id"
          />
        </div>
        <div>
          <label htmlFor="label" className="block text-xs uppercase tracking-wider text-slate-500">
            Display label
          </label>
          <input
            id="label"
            name="label"
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Campaign ID"
          />
        </div>
        <div>
          <label htmlFor="field_type" className="block text-xs uppercase tracking-wider text-slate-500">
            Type
          </label>
          <select id="field_type" name="field_type" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Select (choices)</option>
            <option value="boolean">Boolean</option>
          </select>
        </div>
        <div>
          <label htmlFor="applies_to" className="block text-xs uppercase tracking-wider text-slate-500">
            Applies to
          </label>
          <select id="applies_to" name="applies_to" className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">All types</option>
            <option value="policy">Policy</option>
            <option value="position">Position</option>
            <option value="resolution">Resolution</option>
            <option value="statement">Statement</option>
            <option value="motion">Motion</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="options" className="block text-xs uppercase tracking-wider text-slate-500">
            Choices (comma-separated, only for Select)
          </label>
          <input
            id="options"
            name="options"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="EU, National, Local"
          />
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="required" />
          Required
        </label>
        <button type="submit" className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 sm:col-span-3">
          Add field
        </button>
      </form>

      <div className="mt-8 overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Applies to</th>
              <th className="px-4 py-3">Required</th>
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
                    <button className="text-xs text-red-700 hover:underline">Delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {(fields ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-slate-500">
                  No custom fields yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
