import Link from "next/link";
import { createClient } from "@/lib/db/client";

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-volt-600" aria-hidden />
            <span className="font-semibold">Volt Policy — Public library</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/library" className="hover:underline">
              Library
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded bg-volt-600 px-3 py-1.5 text-sm text-white hover:bg-volt-700"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="rounded bg-volt-600 px-3 py-1.5 text-sm text-white hover:bg-volt-700"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
