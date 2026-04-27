import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { contentToHtml } from "@/lib/sanitize";
import { formatDate } from "@/lib/utils";
import type { Document } from "@/lib/types";

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle<Document & { approved_version_number?: number | null }>();

  if (!doc) notFound();

  // Public sees the LAST APPROVED snapshot, not whatever the latest
  // editor draft happens to be. If the doc never had an explicit approval
  // tracked (legacy data) we fall back to current_content.
  let publicContent = doc.current_content;
  let publicVersion = doc.current_version;
  if (doc.approved_version_number && doc.approved_version_number !== doc.current_version) {
    const { data: snap } = await supabase
      .from("document_versions")
      .select("content,version_number")
      .eq("document_id", doc.id)
      .eq("version_number", doc.approved_version_number)
      .maybeSingle<{ content: string; version_number: number }>();
    if (snap) {
      publicContent = snap.content;
      publicVersion = snap.version_number;
    }
  }

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/library"
        className="text-sm text-slate-500 hover:underline"
      >
        ← Back to library
      </Link>
      <div className="mt-4 text-xs uppercase tracking-wider text-slate-500">
        {doc.document_type} · {doc.language.toUpperCase()} · v{publicVersion}
      </div>
      <h1 className="mt-1 text-4xl font-bold">{doc.title}</h1>
      {doc.purpose && (
        <p className="mt-3 text-lg text-slate-600">{doc.purpose}</p>
      )}
      <div className="mt-3 text-sm text-slate-500">
        Approved {doc.approved_at ? formatDate(doc.approved_at) : "—"}
      </div>
      {doc.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {doc.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-volt-50 px-2 py-0.5 text-xs text-volt-700"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div
        className="prose-doc mt-8"
        dangerouslySetInnerHTML={{ __html: contentToHtml(publicContent) }}
      />
    </article>
  );
}
