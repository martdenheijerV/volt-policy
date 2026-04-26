"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreVersion } from "@/app/(app)/documents/actions";

export default function RestoreButton({
  documentId,
  versionNumber,
}: {
  documentId: string;
  versionNumber: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function handle() {
    if (!confirm(`Restore v${versionNumber} as a new version?`)) return;
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
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
