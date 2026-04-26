import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { htmlToText, lineDiff } from "@/lib/diff";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id,title,current_version")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const fromV = parseInt(from ?? "1", 10);
  const toV = parseInt(to ?? String(doc.current_version), 10);

  const { data: versions } = await supabase
    .from("document_versions")
    .select("version_number,title,content,change_summary,created_at")
    .eq("document_id", id)
    .in("version_number", [fromV, toV])
    .order("version_number", { ascending: true });

  const fromVer = versions?.find((v) => v.version_number === fromV);
  const toVer = versions?.find((v) => v.version_number === toV);
  if (!fromVer || !toVer) notFound();

  const ops = lineDiff(htmlToText(fromVer.content), htmlToText(toVer.content));
  const adds = ops.filter((o) => o.type === "add").length;
  const dels = ops.filter((o) => o.type === "del").length;

  return (
    <div>
      <Link
        href={`/documents/${id}/history`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← Back to history
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Compare versions</h1>
      <p className="mt-1 text-sm text-slate-600">
        {doc.title} — v{fromV} → v{toV}{" "}
        <span className="ml-3 inline-flex items-center gap-2 text-xs">
          <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">
            +{adds}
          </span>
          <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">
            −{dels}
          </span>
        </span>
      </p>

      {toVer.change_summary && (
        <div className="mt-4 rounded border bg-slate-50 p-3 text-sm">
          <span className="font-medium">v{toV} change summary:</span>{" "}
          {toVer.change_summary}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border bg-white font-mono text-sm">
        <ul>
          {ops.map((op, i) => (
            <li
              key={i}
              className={
                op.type === "add"
                  ? "border-l-4 border-green-400 bg-green-50 px-3 py-1"
                  : op.type === "del"
                  ? "border-l-4 border-red-400 bg-red-50 px-3 py-1 line-through opacity-80"
                  : "border-l-4 border-transparent px-3 py-1 text-slate-600"
              }
            >
              <span className="mr-2 select-none text-slate-400">
                {op.type === "add" ? "+" : op.type === "del" ? "−" : " "}
              </span>
              {op.line || "\u00a0"}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
