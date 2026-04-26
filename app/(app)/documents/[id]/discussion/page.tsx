import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/db/client";
import { setDiscussion } from "./actions";

export default async function DiscussionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: link } = await supabase
    .from("document_discussions")
    .select("platform,url")
    .eq("document_id", id)
    .maybeSingle();

  return (
    <div className="max-w-xl">
      <Link href={`/documents/${id}`} className="text-sm text-slate-500 hover:underline">
        ← Back to document
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Discussion link</h1>
      <p className="mt-1 text-sm text-slate-600">
        Link this document to a thread on Slack, Mattermost, Element or Discord.
        Members will see an &ldquo;Open discussion&rdquo; button on the document.
      </p>

      <form action={setDiscussion} className="mt-6 space-y-4 rounded border bg-white p-4">
        <input type="hidden" name="document_id" value={id} />
        <div>
          <label htmlFor="platform" className="block text-xs uppercase tracking-wider text-slate-500">
            Platform
          </label>
          <select id="platform" name="platform" defaultValue={link?.platform ?? ""} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
            <option value="">Other</option>
            <option value="slack">Slack</option>
            <option value="mattermost">Mattermost</option>
            <option value="element">Element / Matrix</option>
            <option value="discord">Discord</option>
            <option value="teams">Microsoft Teams</option>
          </select>
        </div>
        <div>
          <label htmlFor="url" className="block text-xs uppercase tracking-wider text-slate-500">
            URL
          </label>
          <input
            id="url"
            name="url"
            defaultValue={link?.url ?? ""}
            required
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="https://volt.slack.com/archives/C0123/p1234"
          />
        </div>
        <button className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700">
          Save link
        </button>
      </form>
    </div>
  );
}
