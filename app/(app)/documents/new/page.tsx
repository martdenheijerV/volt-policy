import Link from "next/link";
import { createClient } from "@/lib/db/client";
import MetadataField from "@/components/MetadataField";
import { createDocument } from "../actions";

export default async function NewDocumentPage() {
  const supabase = await createClient();
  const { data: fields } = await supabase
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");

  // Group fields: shown for all (applies_to null) vs per-type
  const universal = (fields ?? []).filter((f) => !f.applies_to);

  return (
    <div className="max-w-2xl">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← All documents
      </Link>
      <h1 className="mt-2 text-3xl font-bold">New document</h1>
      <p className="mt-1 text-sm text-slate-600">
        Prefix information is required before the first version can be saved.
      </p>

      <form action={createDocument} className="mt-8 space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm font-medium">
            Title <span className="text-red-600">*</span>
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
              Type
            </label>
            <select
              id="document_type"
              name="document_type"
              defaultValue="policy"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="policy">Policy</option>
              <option value="position">Position</option>
              <option value="resolution">Resolution</option>
              <option value="statement">Statement</option>
              <option value="motion">Motion</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="language" className="block text-sm font-medium">
              Language
            </label>
            <select
              id="language"
              name="language"
              defaultValue="en"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            >
              <option value="en">English</option>
              <option value="nl">Dutch</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="it">Italian</option>
              <option value="es">Spanish</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="purpose" className="block text-sm font-medium">
            Purpose
          </label>
          <textarea
            id="purpose"
            name="purpose"
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Why does this document exist?"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium">
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="climate, eu, trade (comma-separated)"
          />
        </div>

        {universal.length > 0 && (
          <fieldset className="space-y-3 rounded border border-slate-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Custom metadata
            </legend>
            <p className="text-xs text-slate-500">
              Per-type fields will appear after you save and edit the document.
            </p>
            {universal.map((f) => (
              <MetadataField key={f.id} field={f} />
            ))}
          </fieldset>
        )}

        <div>
          <label htmlFor="content" className="block text-sm font-medium">
            Initial content (Markdown or rich text)
          </label>
          <textarea
            id="content"
            name="content"
            rows={10}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder="# Heading&#10;&#10;Your policy text…"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-volt-600 px-5 py-2 font-medium text-white hover:bg-volt-700"
          >
            Create document
          </button>
          <Link
            href="/documents"
            className="rounded border border-slate-300 px-5 py-2 font-medium hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
