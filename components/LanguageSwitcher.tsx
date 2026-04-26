"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_LABELS, SUPPORTED_LANGUAGES, type Lang } from "@/lib/i18n/dictionaries";

export default function LanguageSwitcher({ value }: { value: Lang | string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value;
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
      defaultValue={value}
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
