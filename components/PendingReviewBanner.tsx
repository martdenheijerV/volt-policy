"use client";

import { useState, useTransition } from "react";
import {
  approvePendingChanges,
  rejectPendingChanges,
} from "@/app/(app)/documents/actions";

export interface PendingReviewBannerLabels {
  heading: string;
  body: (args: {
    currentVersion: number;
    approvedVersion: number;
    authorName: string | null;
  }) => string;
  changeSummary: string;
  viewDiff: (from: number, to: number) => string;
  approve: string;
  reject: string;
  busy: string;
  rejectReasonLabel: string;
  rejectReasonPlaceholder: string;
  confirmReject: string;
  cancel: string;
}

/**
 * Shown on the document page when an editor has saved one or more new
 * versions on top of an already-approved document. The public library
 * keeps showing the previously-approved snapshot until the admin clicks
 * Approve, or rolls back via Reject.
 *
 * Visible to admins only — editors don't see this; they just save new
 * versions and wait.
 */
export default function PendingReviewBanner({
  documentId,
  approvedVersion,
  currentVersion,
  pendingAuthorName,
  pendingChangeSummary,
  labels,
}: {
  documentId: string;
  approvedVersion: number;
  currentVersion: number;
  pendingAuthorName?: string | null;
  pendingChangeSummary?: string | null;
  labels: PendingReviewBannerLabels;
}) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approvePendingChanges(documentId);
      if (!res.ok) setError(res.error);
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectPendingChanges(documentId, reason || undefined);
      if (!res.ok) setError(res.error);
      setRejectMode(false);
      setReason("");
    });
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 print:hidden"
    >
      <p className="font-medium text-amber-900">⚠️ {labels.heading}</p>
      <p className="mt-1 text-sm text-amber-900">
        {labels.body({
          currentVersion,
          approvedVersion,
          authorName: pendingAuthorName ?? null,
        })}
      </p>
      {pendingChangeSummary && (
        <p className="mt-2 rounded bg-white/60 px-3 py-2 text-xs text-amber-900">
          <span className="font-medium">{labels.changeSummary}</span>{" "}
          {pendingChangeSummary}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={`/documents/${documentId}/compare?from=${approvedVersion}&to=${currentVersion}`}
          className="rounded border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
        >
          {labels.viewDiff(approvedVersion, currentVersion)}
        </a>

        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? labels.busy : labels.approve}
        </button>

        {!rejectMode && (
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="rounded border border-red-600 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {labels.reject}
          </button>
        )}
      </div>

      {rejectMode && (
        <div className="mt-3 rounded border border-red-200 bg-white p-3">
          <label className="block text-xs font-medium text-slate-700">
            {labels.rejectReasonLabel}
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder={labels.rejectReasonPlaceholder}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? labels.busy : labels.confirmReject}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false);
                setReason("");
              }}
              disabled={pending}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
