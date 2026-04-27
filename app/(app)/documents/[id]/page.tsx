import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import DocumentWorkspace from "@/components/DocumentWorkspace";
import MetadataPanel from "@/components/MetadataPanel";
import PendingReviewBanner from "@/components/PendingReviewBanner";
import { formatDate, statusBadgeClass } from "@/lib/utils";
import type { Comment, Document, Profile } from "@/lib/types";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle<Document & { approved_version_number?: number | null }>();

  if (!doc) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id ?? "")
    .maybeSingle<Profile>();

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  const { data: permission } = await supabase
    .from("document_permissions")
    .select("can_edit")
    .eq("document_id", id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: discussion } = await supabase
    .from("document_discussions")
    .select("platform,url")
    .eq("document_id", id)
    .maybeSingle();

  const { data: metaFields } = await supabase
    .from("metadata_fields")
    .select("id,key,label,field_type,options,required,applies_to,display_order")
    .order("display_order");
  const applicableFields = (metaFields ?? []).filter(
    (f) => !f.applies_to || f.applies_to === doc.document_type
  );
  const { data: metaValues } = await supabase
    .from("document_metadata_values")
    .select("field_id,value")
    .eq("document_id", id);
  const metaValuesMap: Record<string, string> = {};
  for (const r of metaValues ?? []) metaValuesMap[r.field_id] = r.value ?? "";

  const canEdit =
    !!user &&
    (profile?.role === "admin" ||
      profile?.role === "editor" ||
      doc.owner_id === user.id ||
      !!permission?.can_edit);

  // Pending-review state: editor saved a new version on top of an already-
  // approved doc, and the admin hasn't decided yet. Public still sees the
  // previously-approved snapshot.
  const hasPendingReview =
    doc.status === "approved" &&
    typeof doc.approved_version_number === "number" &&
    doc.approved_version_number !== doc.current_version;
  let pendingAuthorName: string | null = null;
  let pendingChangeSummary: string | null = null;
  if (hasPendingReview) {
    const { data: pendingVersion } = await supabase
      .from("document_versions")
      .select("author_id,change_summary")
      .eq("document_id", doc.id)
      .eq("version_number", doc.current_version)
      .maybeSingle<{ author_id: string | null; change_summary: string | null }>();
    pendingChangeSummary = pendingVersion?.change_summary ?? null;
    if (pendingVersion?.author_id) {
      const { data: author } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", pendingVersion.author_id)
        .maybeSingle<{ full_name: string }>();
      pendingAuthorName = author?.full_name ?? null;
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/documents"
          className="text-sm text-slate-500 hover:underline"
        >
          ← All documents
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${statusBadgeClass(
              doc.status
            )}`}
          >
            {doc.status}
          </span>
          <Link
            href={`/documents/${doc.id}/history`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            History
          </Link>
          <Link
            href={`/documents/${doc.id}/translations`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Translations
          </Link>
          <Link
            href={`/documents/${doc.id}/amendments`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Amendments
          </Link>
          <Link
            href={`/documents/${doc.id}/citations`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            Citations
          </Link>
          {discussion?.url ? (
            <a
              href={discussion.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-volt-600 px-3 py-1 font-medium text-volt-700 hover:bg-volt-50"
            >
              💬 Open discussion
            </a>
          ) : canEdit ? (
            <Link
              href={`/documents/${doc.id}/discussion`}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
            >
              + Discussion link
            </Link>
          ) : null}
          <a
            href={`/api/documents/${doc.id}/export?format=md`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .md
          </a>
          <a
            href={`/api/documents/${doc.id}/export?format=html`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .html
          </a>
          <a
            href={`/api/documents/${doc.id}/export?format=docx`}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            .docx
          </a>
        </div>
      </div>

      <div className="mb-2 text-xs text-slate-500 print:hidden">
        {doc.document_type} · {doc.language.toUpperCase()} · updated{" "}
        {formatDate(doc.updated_at)}
        {doc.approved_at && ` · approved ${formatDate(doc.approved_at)}`}
      </div>

      {doc.purpose && (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 print:hidden">
          <span className="font-medium">Purpose:</span> {doc.purpose}
        </div>
      )}

      {hasPendingReview && profile?.role === "admin" && (
        <PendingReviewBanner
          documentId={doc.id}
          approvedVersion={doc.approved_version_number!}
          currentVersion={doc.current_version}
          pendingAuthorName={pendingAuthorName}
          pendingChangeSummary={pendingChangeSummary}
        />
      )}
      {hasPendingReview && profile?.role !== "admin" && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
          ⏳ Versie v{doc.current_version} is opgeslagen en wacht op admin-goedkeuring.
          Public ziet nog v{doc.approved_version_number}.
        </div>
      )}

      {applicableFields.length > 0 && (
        <div className="mb-4">
          <MetadataPanel
            documentId={doc.id}
            fields={applicableFields}
            values={metaValuesMap}
            canEdit={canEdit}
          />
        </div>
      )}

      <DocumentWorkspace
        documentId={doc.id}
        initialTitle={doc.title}
        initialContent={doc.current_content}
        currentVersion={doc.current_version}
        canEdit={canEdit}
        status={doc.status}
        language={doc.language}
        comments={(comments as Comment[]) ?? []}
        currentUserId={user?.id ?? null}
        userRole={profile?.role ?? null}
      />
    </div>
  );
}
