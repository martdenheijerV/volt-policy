"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_LABELS, SUPPORTED_LANGUAGES, type Lang } from "@/lib/i18n/dictionaries";

/**
 * Controlled language picker.
 *
 * It's important this stays controlled (`value` + `useState`) rather than
 * using `defaultValue` — otherwise mounting the same component in two
 * places (the nav and the dashboard) makes them drift: changing the
 * dashboard's switcher fires `router.refresh()`, the nav re-renders
 * server-side with the new prop, but the already-mounted nav <select>
 * keeps whatever the user last picked locally. Controlled + a useEffect
 * that mirrors the prop into local state means both switchers stay in
 * sync after a refresh.
 */
export default function LanguageSwitcher({ value }: { value: Lang | string }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState<string>(value);
  const router = useRouter();

  // Re-sync from server-rendered prop when language is changed elsewhere
  // on the page (e.g. another switcher fires router.refresh()).
  useEffect(() => {
    setCurrent(value);
  }, [value]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;
    setCurrent(lang);
    start(async () => {
      await fetch("/api/lang", {
        method: "POST",
        body: JSON.stringify({ lang }),
        headers: { "content-type": "application/json" },
      });
      router.refresh();
    });
  }

  return (
    <select
      value={current}
      onChange={onChange}
      disabled={pending}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
      aria-label="Language"
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {LANG_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
