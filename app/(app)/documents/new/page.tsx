import Link from "next/link";
import { createClient } from "@/lib/db/client";
import MetadataField from "@/components/MetadataField";
import { createDocument } from "../actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import { DOC_TYPES, DOC_TYPE_LABELS } from "@/lib/doc-types";

export default async function NewDocumentPage() {
  const supabase = await createClient();
  const { tr } = await getTr();
  const { data: fields } = await supabase
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");

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
  ] = await Promise.all([
    tr("Why does this document exist?"),
    tr("climate, eu, trade (comma-separated)"),
    tr("# Heading\n\nYour policy text…"),
    tr("Optional features"),
    tr("Enable citations / bibliography"),
    tr(
      "Adds a Citations tab to the document. Use it when you want to formally reference sources with a [@cite_key] in the body and an auto-rendered bibliography on export. Most docs don't need this — leave off for plain hyperlink references."
    ),
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
