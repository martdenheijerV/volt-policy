import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { formatDate } from "@/lib/utils";
import { decideAmendment, proposeAmendment, toggleSupport } from "./actions";
import { T } from "@/components/T";
import { getTr } from "@/lib/i18n/server";

export default async function AmendmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { tr } = await getTr();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("id,title,owner_id,status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const { data: amendments } = await supabase
    .from("amendments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  const { data: mySupport } = await supabase
    .from("amendment_supporters")
    .select("amendment_id")
    .eq("user_id", user?.id ?? "");

  const supportedSet = new Set((mySupport ?? []).map((s) => s.amendment_id));

  const supportCounts: Record<string, number> = {};
  if (amendments && amendments.length > 0) {
    const { data: counts } = await supabase
      .from("amendment_supporters")
      .select("amendment_id")
      .in("amendment_id", amendments.map((a) => a.id));
    (counts ?? []).forEach((row) => {
      supportCounts[row.amendment_id] = (supportCounts[row.amendment_id] ?? 0) + 1;
    });
  }

  const canDecide =
    profile?.role === "admin" || doc.owner_id === user?.id;

  const [
    targetLabel,
    replacementLabel,
    rationaleLabel,
    proposeBtn,
    noAmendments,
    targetCol,
    replacementCol,
    rationalePrefix,
    supporterSingularTpl,
    supporterPluralTpl,
    support,
    unsupport,
    acceptApply,
    reject,
    unknown,
    statusProposed,
    statusAccepted,
    statusRejected,
    statusWithdrawn,
  ] = await Promise.all([
    tr("Exact passage to replace"),
    tr("Replacement text"),
    tr("Rationale (optional)"),
    tr("Propose"),
    tr("No amendments yet."),
    tr("Target"),
    tr("Replacement"),
    tr("Rationale: "),
    tr("{n} supporter"),
    tr("{n} supporters"),
    tr("Support"),
    tr("Unsupport"),
    tr("Accept & apply"),
    tr("Reject"),
    tr("Unknown"),
    tr("proposed"),
    tr("accepted"),
    tr("rejected"),
    tr("withdrawn"),
  ]);

  const statusLabel = (s: string) =>
    s === "accepted"
      ? statusAccepted
      : s === "rejected"
      ? statusRejected
      : s === "withdrawn"
      ? statusWithdrawn
      : statusProposed;

  return (
    <div className="max-w-3xl">
      <Link
        href={`/documents/${id}`}
        className="text-sm text-slate-500 hover:underline"
      >
        ← <T>Back to document</T>
      </Link>
      <h1 className="mt-2 text-3xl font-bold">
        <T>Amendments</T>
      </h1>
      <p className="mt-1 text-slate-600">{doc.title}</p>

      {user && (
        <form
          action={proposeAmendment}
          className="mt-6 space-y-3 rounded border bg-white p-4"
        >
          <input type="hidden" name="document_id" value={id} />
          <h2 className="text-lg font-semibold">
            <T>Propose an amendment</T>
          </h2>
          <div>
            <label
              htmlFor="target_quote"
              className="block text-xs uppercase tracking-wider text-slate-500"
            >
              {targetLabel}
            </label>
            <textarea
              id="target_quote"
              name="target_quote"
              required
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="replacement_text"
              className="block text-xs uppercase tracking-wider text-slate-500"
            >
              {replacementLabel}
            </label>
            <textarea
              id="replacement_text"
              name="replacement_text"
              required
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="rationale"
              className="block text-xs uppercase tracking-wider text-slate-500"
            >
              {rationaleLabel}
            </label>
            <textarea
              id="rationale"
              name="rationale"
              rows={2}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700"
          >
            {proposeBtn}
          </button>
        </form>
      )}

      <div className="mt-8 space-y-4">
        {(amendments ?? []).length === 0 && (
          <div className="rounded border bg-white p-6 text-center text-sm text-slate-500">
            {noAmendments}
          </div>
        )}
        {(amendments ?? []).map((a) => {
          const count = supportCounts[a.id] ?? 0;
          const supporters = (count === 1 ? supporterSingularTpl : supporterPluralTpl).replace(
            "{n}",
            String(count)
          );
          return (
            <article
              key={a.id}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">
                    {a.proposer_name_cached ?? unknown}
                  </span>{" "}
                  · {formatDate(a.created_at)}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    a.status === "accepted"
                      ? "bg-green-100 text-green-800"
                      : a.status === "rejected"
                      ? "bg-red-100 text-red-800"
                      : a.status === "withdrawn"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {statusLabel(a.status)}
                </span>
              </header>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {targetCol}
                  </div>
                  <p className="mt-1 rounded border-l-4 border-red-300 bg-red-50 p-2 text-sm">
                    {a.target_quote}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {replacementCol}
                  </div>
                  <p className="mt-1 rounded border-l-4 border-green-300 bg-green-50 p-2 text-sm">
                    {a.replacement_text}
                  </p>
                </div>
              </div>
              {a.rationale && (
                <p className="mt-3 rounded bg-slate-50 p-2 text-sm text-slate-700">
                  <span className="font-medium">{rationalePrefix}</span>
                  {a.rationale}
                </p>
              )}
              <footer className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-600">{supporters}</span>
                {user && a.status === "proposed" && (
                  <form
                    action={async () => {
                      "use server";
                      await toggleSupport(a.id, id);
                    }}
                  >
                    <button className="rounded border border-volt-600 px-3 py-1 text-xs font-medium text-volt-700 hover:bg-volt-50">
                      {supportedSet.has(a.id) ? unsupport : support}
                    </button>
                  </form>
                )}
                {canDecide && a.status === "proposed" && (
                  <>
                    <form
                      action={async () => {
                        "use server";
                        await decideAmendment(a.id, id, "accepted");
                      }}
                    >
                      <button className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">
                        {acceptApply}
                      </button>
                    </form>
                    <form
                      action={async () => {
                        "use server";
                        await decideAmendment(a.id, id, "rejected");
                      }}
                    >
                      <button className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">
                        {reject}
                      </button>
                    </form>
                  </>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
