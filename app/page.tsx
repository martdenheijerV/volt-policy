import Link from "next/link";
import { createClient } from "@/lib/db/client";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-volt-600" aria-hidden />
            <span className="text-lg font-semibold">Volt Policy</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/library" className="hover:underline">
              Public library
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded bg-volt-600 px-4 py-2 text-white hover:bg-volt-700"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="hover:underline">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded bg-volt-600 px-4 py-2 text-white hover:bg-volt-700"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">
          The single source of truth for
          <span className="text-volt-600"> Volt political documents</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          A collaborative policy platform for drafting, reviewing, approving,
          and publishing Volt policies, positions, resolutions, and statements.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link
            href="/library"
            className="rounded bg-volt-600 px-6 py-3 font-medium text-white hover:bg-volt-700"
          >
            Browse public library
          </Link>
          <Link
            href={user ? "/dashboard" : "/signup"}
            className="rounded border border-volt-600 px-6 py-3 font-medium text-volt-700 hover:bg-volt-50"
          >
            {user ? "Open dashboard" : "Join as a member"}
          </Link>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          <Feature
            title="Collaborative editor"
            body="Draft, review and comment on policy documents with full version history and restore."
          />
          <Feature
            title="Role-based access"
            body="Admin, editor, member and translator roles with per-document permissions and RLS."
          />
          <Feature
            title="Public library"
            body="Approved documents are published to a searchable public library — no login required."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-6">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
