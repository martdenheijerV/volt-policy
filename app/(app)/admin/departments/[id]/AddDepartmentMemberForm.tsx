"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDepartmentMember } from "../actions";

/**
 * Compact "add member" combo: a select listing every profile not
 * already in the department, plus an Add button. After a successful
 * add we router.refresh() so the table re-renders with the new row.
 *
 * Mirrors the GroupActions component on /admin/groups/[id] in spirit
 * but stays single-purpose (no other actions live here yet).
 */
export default function AddDepartmentMemberForm({
  departmentId,
  candidates,
  labels,
}: {
  departmentId: string;
  candidates: Array<{ id: string; full_name: string | null; role: string | null }>;
  labels: { add: string; failed: string };
}) {
  const router = useRouter();
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!picked) return;
    setError(null);
    start(async () => {
      try {
        await addDepartmentMember(departmentId, picked);
        setPicked("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  if (candidates.length === 0) return null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-3">
      <label
        htmlFor="add-dept-member"
        className="sr-only"
      >
        {labels.add}
      </label>
      <select
        id="add-dept-member"
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
      >
        <option value="">{labels.add}…</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name ?? c.id.slice(0, 8)}
            {c.role ? ` (${c.role})` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={!picked || pending}
        className="rounded bg-volt-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
      >
        {labels.add}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
