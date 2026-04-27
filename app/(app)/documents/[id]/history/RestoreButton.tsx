"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreVersion } from "@/app/(app)/documents/actions";

export interface RestoreButtonLabels {
  /** Template "Restore v{n} as a new version?" — {n} is replaced client-side. */
  confirmTpl: string;
  restoring: string;
  restore: string;
}

export default function RestoreButton({
  documentId,
  versionNumber,
  labels,
}: {
  documentId: string;
  versionNumber: number;
  labels: RestoreButtonLabels;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function handle() {
    if (!confirm(labels.confirmTpl.replace("{n}", String(versionNumber)))) return;
    start(async () => {
      await restoreVersion(documentId, versionNumber);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="rounded border border-volt-600 px-3 py-1 text-xs font-medium text-volt-700 hover:bg-volt-50 disabled:opacity-50"
    >
      {pending ? labels.restoring : labels.restore}
    </button>
  );
}
