import Link from "next/link";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";
import ImportForm, { type ImportFormLabels } from "./ImportForm";

export default async function ImportPage() {
  const { tr } = await getTr();
  const [
    fileLabel,
    typeLabel,
    languageLabel,
    typePolicy,
    typePosition,
    typeResolution,
    typeStatement,
    typeMotion,
    typeOther,
    importing,
    importBtn,
    importFailed,
  ] = await Promise.all([
    tr("File"),
    tr("Type"),
    tr("Language"),
    tr("Policy"),
    tr("Position"),
    tr("Resolution"),
    tr("Statement"),
    tr("Motion"),
    tr("Other"),
    tr("Importing…"),
    tr("Import"),
    tr("Import failed"),
  ]);

  const labels: ImportFormLabels = {
    fileLabel,
    typeLabel,
    languageLabel,
    typePolicy,
    typePosition,
    typeResolution,
    typeStatement,
    typeMotion,
    typeOther,
    importing,
    importBtn,
    importFailed,
  };

  return (
    <div className="max-w-xl">
      <Link href="/documents" className="text-sm text-slate-500 hover:underline">
        ← <T>All documents</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        <T>Import a document</T>
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        <T>
          Upload a .docx, .pdf, .html, .md or .txt file. We&apos;ll create a
          draft you can review before publishing.
        </T>
      </p>

      <ImportForm labels={labels} />
    </div>
  );
}
