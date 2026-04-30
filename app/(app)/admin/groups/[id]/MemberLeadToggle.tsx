"use client";

import { useState, useTransition } from "react";
import { setGroupLead } from "../actions";

/**
 * Per-member badge + toggle on the group detail page. When the
 * member is a designated lead, shows a small "Lead" pill; either
 * way, an admin can flip the state with a click. Optimistic — the
 * UI updates immediately and rolls back on server error.
 */
export default function MemberLeadToggle({
  groupId,
  userId,
  initialLead,
  labels,
}: {
  groupId: string;
  userId: string;
  initialLead: boolean;
  labels: { lead: string; makeLead: string; unmakeLead: string; failed: string };
}) {
  const [lead, setLead] = useState(initialLead);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !lead;
    setLead(next);
    setError(null);
    startTransition(async () => {
      try {
        await setGroupLead(groupId, userId, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
        setLead(!next);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {lead && (
        <span
          className="inline-flex items-center rounded-full bg-volt-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-volt-800"
          aria-label={labels.lead}
        >
          {labels.lead}
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="text-xs text-slate-600 hover:underline disabled:opacity-50"
      >
        {lead ? labels.unmakeLead : labels.makeLead}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
