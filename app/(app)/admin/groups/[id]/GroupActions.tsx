"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember } from "../actions";

export interface GroupActionsLabels {
  addMember: string;
  add: string;
  adding: string;
}

export default function GroupActions({
  groupId,
  allProfiles,
  memberIds,
  labels,
}: {
  groupId: string;
  allProfiles: { id: string; full_name: string | null; role: string }[];
  memberIds: string[];
  labels: GroupActionsLabels;
}) {
  const [selected, setSelected] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const candidates = allProfiles.filter((p) => !memberIds.includes(p.id));

  function add() {
    if (!selected) return;
    start(async () => {
      await addMember(groupId, selected);
      setSelected("");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex items-center gap-2 rounded border bg-white p-3 text-sm">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded border border-slate-300 px-2 py-1"
      >
        <option value="">{labels.addMember}</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.id} ({p.role})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={!selected || pending}
        className="rounded bg-volt-600 px-3 py-1 text-xs font-medium text-white hover:bg-volt-700 disabled:opacity-50"
      >
        {pending ? labels.adding : labels.add}
      </button>
    </div>
  );
}
