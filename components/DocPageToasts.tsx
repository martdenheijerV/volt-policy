"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  approvePendingChanges,
  rejectPendingChanges,
} from "@/app/(app)/documents/actions";

/**
 * Bottom-right stacked notice surface for the document page.
 *
 * Replaces the four full-width banners that used to crowd the area
 * above the editor (review-locked, approved-info, pending-review,
 * auto-translate). Toasts are dismissible, stack vertically, and never
 * push the editor down. Important / actionable ones (pending review,
 * review lock) stay visible by default — they hold actions the user
 * still needs to take. Informational ones (auto-translate) are
 * dismissible and stay dismissed for the session.
 *
 * The pending-review toast embeds Approve/Reject inline so the
 * approver can decide without leaving the editor view. Reject opens a
 * small "rejection reason" prompt, mirroring the old PendingReviewBanner
 * behaviour but in a much smaller footprint.
 */
export interface DocPageToastsLabels {
  // Pending review
  pendingHeading: string;
  pendingBodyTpl: string; // "v{n} by {author}, public sees v{m}"
  pendingBodyTplNoAuthor: string;
  approve: string;
  reject: string;
  busy: string;
  rejectReasonPlaceholder: string;
  confirmReject: string;
  cancel: string;
  viewDiffTpl: string; // "Diff v{from} → v{to}"
  // Review lock (read-only members)
  reviewLockedHeading: string;
  reviewLockedBodyTpl: string; // "An admin is reviewing v{n}…"
  // Review lock (approver — call to action)
  approverHeading: string;
  approverBodyTpl: string; // "You're reading v{n}. Approve to publish or reject."
  dismiss: string;
}

export default function DocPageToasts({
  documentId,
  documentSlug,
  status,
  isApprover,
  reviewVersionNumber,
  approvedVersionNumber,
  pendingReview,
  labels,
}: {
  documentId: string;
  documentSlug: string;
  status: "draft" | "review" | "approved" | "archived";
  isApprover: boolean;
  reviewVersionNumber: number | null;
  approvedVersionNumber: number | null;
  pendingReview: {
    currentVersion: number;
    approvedVersion: number;
    authorName: string | null;
    changeSummary: string | null;
  } | null;
  labels: DocPageToastsLabels;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function dismiss(key: string) {
    setDismissed((s) => {
      const n = new Set(s);
      n.add(key);
      return n;
    });
  }

  function onApprove() {
    setError(null);
    start(async () => {
      const r = await approvePendingChanges(documentId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function onReject() {
    setError(null);
    start(async () => {
      const r = await rejectPendingChanges(documentId, rejectReason || undefined);
      if (!r.ok) setError(r.error);
      else {
        setRejectReason("");
        setRejectOpen(false);
        router.refresh();
      }
    });
  }

  // Decide which toasts are visible right now. Order matters — actionable
  // first (top of stack), informational last.
  const showPending =
    pendingReview && isApprover && !dismissed.has("pending");
  const showReviewLock =
    status === "review" && !dismissed.has("review-lock");

  const anyVisible = showPending || showReviewLock;
  if (!anyVisible) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-40 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:max-w-md print:hidden"
    >
      {showPending && pendingReview && (
        <div
          role="alert"
          className="pointer-events-auto w-full rounded-lg border border-amber-300 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span aria-hidden>⚠️</span>
                <span className="text-sm font-semibold text-amber-900">
                  {labels.pendingHeading}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {(pendingReview.authorName
                  ? labels.pendingBodyTpl
                  : labels.pendingBodyTplNoAuthor)
                  .replace("{n}", String(pendingReview.currentVersion))
                  .replace("{m}", String(pendingReview.approvedVersion))
                  .replace("{author}", pendingReview.authorName ?? "")}
              </p>
              {pendingReview.changeSummary && (
                <p className="mt-1 text-xs italic text-slate-600">
                  “{pendingReview.changeSummary}”
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={`/documents/${documentId}/compare?from=${pendingReview.approvedVersion}&to=${pendingReview.currentVersion}`}
                  className="text-xs text-amber-800 underline hover:no-underline"
                >
                  {labels.viewDiffTpl
                    .replace("{from}", String(pendingReview.approvedVersion))
                    .replace("{to}", String(pendingReview.currentVersion))}
                </Link>
              </div>
              {!rejectOpen ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={pending}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pending ? labels.busy : labels.approve}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectOpen(true)}
                    disabled={pending}
                    className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {labels.reject}
                  </button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder={labels.rejectReasonPlaceholder}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onReject}
                      disabled={pending}
                      className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {pending ? labels.busy : labels.confirmReject}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectOpen(false);
                        setRejectReason("");
                      }}
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                    >
                      {labels.cancel}
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss("pending")}
              aria-label={labels.dismiss}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showReviewLock && (
        <div
          role="status"
          className="pointer-events-auto w-full rounded-lg border border-amber-300 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span aria-hidden>🔒</span>
                <span className="text-sm font-semibold text-amber-900">
                  {isApprover ? labels.approverHeading : labels.reviewLockedHeading}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {(isApprover
                  ? labels.approverBodyTpl
                  : labels.reviewLockedBodyTpl
                ).replace(
                  "{n}",
                  String(reviewVersionNumber ?? approvedVersionNumber ?? "")
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss("review-lock")}
              aria-label={labels.dismiss}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Slug isn't actually rendered anywhere in the toasts — it's
          available as a prop in case we add a "View public" link later. */}
      <span className="sr-only">{documentSlug}</span>
    </div>
  );
}
