import Link from "next/link";
import { createClient } from "@/lib/db/client";
import { getTr } from "@/lib/i18n/server";
import { T } from "@/components/T";

const SECTIONS = [
  { slug: "", label: "Overview" },
  { slug: "create-document", label: "Writing & editing" },
  { slug: "review-and-approve", label: "Review & approve" },
  { slug: "comments", label: "Comments" },
  { slug: "ai-assistant", label: "AI assistant" },
  { slug: "amendments", label: "Amendments" },
  { slug: "translations", label: "Translations" },
  { slug: "export", label: "Export & print" },
  { slug: "roles", label: "Roles & permissions" },
];

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { tr } = await getTr();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Translate sidebar labels in one batch.
  const sectionLabels = await Promise.all(
    SECTIONS.map((s) => tr(s.label))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-volt-600" aria-hidden />
            <span className="font-semibold">
              <T>Volt Policy — Help</T>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/library" className="hover:underline">
              <T>Library</T>
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded bg-volt-600 px-3 py-1.5 text-white hover:bg-volt-700"
              >
                <T>Dashboard</T>
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded bg-volt-600 px-3 py-1.5 text-white hover:bg-volt-700"
              >
                <T>Sign in</T>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            <T>Help center</T>
          </h2>
          <nav className="mt-3 flex flex-col gap-1 text-sm">
            {SECTIONS.map((s, i) => (
              <Link
                key={s.slug}
                href={s.slug ? `/help/${s.slug}` : "/help"}
                className="rounded px-3 py-1.5 hover:bg-slate-100"
              >
                {sectionLabels[i]}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="prose-doc max-w-3xl">{children}</article>
      </div>
    </div>
  );
}
