import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { contentToHtml } from "@/lib/sanitize";
import { formatDate } from "@/lib/utils";
import { getDocInLanguage } from "@/lib/translate";
import { docTypeLabel } from "@/lib/doc-types";
import type { Document } from "@/lib/types";

const SUPPORTED_LANGS = ["nl", "en", "de", "fr", "it", "es"];

export default async function PublicDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const db = await createClient();

  // Public sees any doc that has ever been approved (and isn't archived),
  // regardless of current status. This way an editor re-opening an
  // approved doc to draft a new version doesn't temporarily yank the
  // existing public version off /library.
  const { data: doc } = await db
    .from("documents")
    .select("*")
    .eq("slug", slug)
    .gte("approved_version_number", 1)
    .neq("status", "archived")
    .maybeSingle<Document & { approved_version_number?: number | null }>();

  if (!doc) notFound();

  // Public sees the LAST APPROVED snapshot, not whatever the latest
  // editor draft happens to be. If the doc never had an explicit approval
  // tracked (legacy data) we fall back to current_content.
  let publicContent = doc.current_content;
  let publicTitle = doc.title;
  let publicVersion = doc.current_version;
  if (doc.approved_version_number && doc.approved_version_number !== doc.current_version) {
    const { data: snap } = await db
      .from("document_versions")
      .select("title,content,version_number")
      .eq("document_id", doc.id)
      .eq("version_number", doc.approved_version_number)
      .maybeSingle<{ title: string; content: string; version_number: number }>();
    if (snap) {
      publicTitle = snap.title;
      publicContent = snap.content;
      publicVersion = snap.version_number;
    }
  }

  // Determine the visitor's preferred language. Order of precedence:
  //   1. ?lang= query param (explicit user choice via switcher)
  //   2. NEXT_LOCALE cookie (set by the in-app LanguageSwitcher)
  //   3. The doc's own source language (no translation needed)
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get("NEXT_LOCALE")?.value;
  const requestedLang = (sp.lang ?? cookieLang ?? doc.language).toLowerCase();
  const targetLang = SUPPORTED_LANGS.includes(requestedLang)
    ? requestedLang
    : doc.language.toLowerCase();

  const rendered = await getDocInLanguage({
    documentId: doc.id,
    sourceLanguage: doc.language,
    sourceTitle: publicTitle,
    sourceContent: publicContent,
    sourceVersion: publicVersion,
    targetLanguage: targetLang,
  });

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/library"
        className="text-sm text-slate-500 hover:underline"
      >
        ← Back to library
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-wider text-slate-500">
        <span>
          {docTypeLabel(doc.document_type)} · {rendered.language.toUpperCase()} · v{publicVersion}
        </span>
        {!rendered.isOriginal && (
          <Link
            href={`/library/${slug}?lang=${doc.language}`}
            className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium normal-case text-slate-700 hover:bg-slate-200"
          >
            View original ({doc.language.toUpperCase()})
          </Link>
        )}
      </div>
      <h1 className="mt-1 text-4xl font-bold">{rendered.title}</h1>
      {doc.purpose && (
        <p className="mt-3 text-lg text-slate-600">{doc.purpose}</p>
      )}
      <div className="mt-3 text-sm text-slate-500">
        Approved {doc.approved_at ? formatDate(doc.approved_at) : "—"}
      </div>
      {doc.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {doc.tags.map((t: string) => (
            <span
              key={t}
              className="rounded bg-volt-50 px-2 py-0.5 text-xs text-volt-700"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {!rendered.isOriginal && (
        <div className="mt-4 rounded border border-volt-200 bg-volt-50 px-3 py-2 text-xs text-volt-900">
          🌐 Auto-translated from {rendered.sourceLanguage.toUpperCase()} via
          DeepL. The original text is authoritative.
        </div>
      )}
      <div
        className="prose-doc mt-8"
        dangerouslySetInnerHTML={{ __html: contentToHtml(rendered.content) }}
      />
    </article>
  );
}
