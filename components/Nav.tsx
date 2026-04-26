import Link from "next/link";
import LanguageSwitcher from "./LanguageSwitcher";
import { getT } from "@/lib/i18n/server";
import type { Profile } from "@/lib/types";

export default async function Nav({ profile }: { profile: Profile | null }) {
  const { t, lang } = await getT();
  const roleBadge = profile?.role ?? "member";
  return (
    <header className="border-b bg-white print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-volt-600" aria-hidden />
          <span className="font-semibold">Volt Policy</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm" aria-label="Main">
          <Link href="/dashboard" className="hover:underline">
            {t("nav.dashboard")}
          </Link>
          <Link href="/documents" className="hover:underline">
            {t("nav.documents")}
          </Link>
          <Link href="/library" className="hover:underline">
            {t("nav.library")}
          </Link>
          <Link href="/help" className="hover:underline">
            {t("nav.help")}
          </Link>
          {profile?.role === "admin" && (
            <>
              <Link href="/admin/users" className="hover:underline">
                {t("nav.admin")}
              </Link>
              <Link href="/admin/groups" className="hover:underline">
                Groups
              </Link>
              <Link href="/admin/metadata" className="hover:underline">
                Metadata
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <LanguageSwitcher value={profile?.language_pref ?? lang} />
          <Link
            href="/settings"
            className="rounded-full bg-volt-50 px-3 py-1 text-xs font-medium text-volt-700 hover:bg-volt-100"
            title={profile?.full_name ?? ""}
          >
            {roleBadge}
          </Link>
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              {t("nav.signout")}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
