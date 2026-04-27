"use client";

import { useState, useTransition } from "react";
import {
  approvePendingChanges,
  rejectPendingChanges,
} from "@/app/(app)/documents/actions";

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
}: {
  documentId: string;
  approvedVersion: number;
  currentVersion: number;
  pendingAuthorName?: string | null;
  pendingChangeSummary?: string | null;
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
      <p className="font-medium text-amber-900">
        ⚠️ Wijzigingen in afwachting van goedkeuring
      </p>
      <p className="mt-1 text-sm text-amber-900">
        Versie <strong>v{currentVersion}</strong> is opgeslagen
        {pendingAuthorName ? ` door ${pendingAuthorName}` : ""}. Public ziet
        nog steeds <strong>v{approvedVersion}</strong>. Approve om de nieuwe
        versie publiek te maken, of reject om terug te rollen.
      </p>
      {pendingChangeSummary && (
        <p className="mt-2 rounded bg-white/60 px-3 py-2 text-xs text-amber-900">
          <span className="font-medium">Change summary:</span>{" "}
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
          Bekijk diff (v{approvedVersion} → v{currentVersion})
        </a>

        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Bezig…" : "Approve"}
        </button>

        {!rejectMode && (
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={pending}
            className="rounded border border-red-600 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Reject
          </button>
        )}
      </div>

      {rejectMode && (
        <div className="mt-3 rounded border border-red-200 bg-white p-3">
          <label className="block text-xs font-medium text-slate-700">
            Reden voor afwijzing (optioneel — wordt bewaard in audit log)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Bv. inhoudelijk niet correct, of strijdig met richtlijn X"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {pending ? "Bezig…" : "Bevestig reject (rollt terug)"}
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
              Annuleer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
