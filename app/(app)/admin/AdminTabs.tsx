"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab strip for /admin pages. Client component because the active
 * state needs `usePathname` — Next.js App Router server layouts
 * don't have a direct read on the current route segment.
 */
export default function AdminTabs({
  tabs,
}: {
  tabs: { slug: string; label: string }[];
}) {
  const pathname = usePathname() ?? "";
  // First match by prefix wins. /admin/users matches "users",
  // /admin/groups/<id> matches "groups", etc.
  const active =
    tabs.find((t) => pathname.startsWith(`/admin/${t.slug}`))?.slug ??
    tabs[0]?.slug;
  return (
    <nav
      aria-label="Beheer tabs"
      className="mt-6 flex flex-wrap gap-1 border-b border-slate-200"
    >
      {tabs.map((t) => {
        const isActive = t.slug === active;
        return (
          <Link
            key={t.slug}
            href={`/admin/${t.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px rounded-t border-b-2 px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "border-volt-600 text-volt-700"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
