import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { LANG_LABELS } from "@/lib/i18n/dictionaries";
import TranslationEditor from "./TranslationEditor";

export default async function TranslationEditorPage({
  params,
}: {
  params: Promise<{ id: string; lang: string }>;
}) {
  const { id, lang } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id,title,language,current_content,current_version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: tr } = await supabase
    .from("document_translations")
    .select("*")
    .eq("document_id", id)
    .eq("language", lang)
    .maybeSingle();
  if (!tr) notFound();

  return (
    <div>
      <Link
        href={`/documents/${id}/translations`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← All translations
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        {LANG_LABELS[lang as keyof typeof LANG_LABELS] ?? lang} translation
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Source v{tr.source_version} · current document v{doc.current_version}
        {tr.source_version < doc.current_version && (
          <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            Source has changed since translation
          </span>
        )}
      </p>

      <TranslationEditor
        documentId={doc.id}
        sourceLanguage={doc.language}
        targetLanguage={lang}
        sourceTitle={doc.title}
        sourceContent={doc.current_content}
        translationTitle={tr.title}
        translationContent={tr.content}
        status={tr.status}
      />
    </div>
  );
}
