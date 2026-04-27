"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleVersionHidden } from "@/app/(app)/documents/actions";

export interface HideToggleLabels {
  show: string;
  hide: string;
  ellipsis: string;
  titleShow: string;
  titleHide: string;
}

export default function HideToggle({
  documentId,
  versionNumber,
  isHidden,
  labels,
}: {
  documentId: string;
  versionNumber: number;
  isHidden: boolean;
  labels: HideToggleLabels;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function toggle() {
    start(async () => {
      await toggleVersionHidden(documentId, versionNumber);
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
      title={isHidden ? labels.titleShow : labels.titleHide}
    >
      {pending ? labels.ellipsis : isHidden ? labels.show : labels.hide}
    </button>
  );
}
