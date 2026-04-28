"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Three-dots overflow menu for the document header.
 *
 * Opens on click, closes on outside-click + Escape. Items are passed as
 * a typed config so the parent can mix server links (Next/Link), plain
 * anchors (download URLs) and divider rules without us re-implementing
 * the popover for each shape.
 *
 * Why a custom popover and not a `<details>`: a `<details>` element
 * doesn't position absolutely above siblings and can't be closed by
 * clicking outside. Modern UX expects both.
 */
export type OverflowItem =
  | {
      kind: "link";
      label: string;
      href: string;
      icon?: string;
      external?: boolean;
    }
  | {
      kind: "download";
      label: string;
      href: string;
      icon?: string;
    }
  | { kind: "divider" };

export default function DocOverflowMenu({
  items,
  ariaLabel,
}: {
  items: OverflowItem[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-lg border bg-white py-1 text-sm shadow-xl"
        >
          {items.map((item, i) => {
            if (item.kind === "divider") {
              return <div key={i} className="my-1 h-px bg-slate-200" />;
            }
            const cls =
              "flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50";
            if (item.kind === "download") {
              return (
                <a
                  key={i}
                  href={item.href}
                  download
                  role="menuitem"
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden className="text-slate-400">
                    {item.icon ?? "↓"}
                  </span>
                  {item.label}
                </a>
              );
            }
            if (item.external) {
              return (
                <a
                  key={i}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden className="text-slate-400">
                    {item.icon ?? "↗"}
                  </span>
                  {item.label}
                </a>
              );
            }
            return (
              <Link
                key={i}
                href={item.href}
                role="menuitem"
                className={cls}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden className="text-slate-400">
                  {item.icon ?? "›"}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
