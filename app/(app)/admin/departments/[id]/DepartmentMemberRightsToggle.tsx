"use client";

import { useState, useTransition } from "react";
import { setDepartmentMemberRights } from "../actions";

/**
 * Department-scoped twin of MemberRightsToggle (groups). Same
 * semantics — see ../groups/[id]/MemberRightsToggle.tsx for the
 * full rationale on:
 *   - lead-cells rendering as a static "✓"
 *   - both flags being sent atomically to keep the "edit implies
 *     read" invariant
 *   - optimistic update with rollback-on-error
 *
 * Reason for a separate file rather than a generic component: the
 * server actions are different (groups vs departments) and we'd
 * rather pay the few duplicate lines than thread an action prop
 * through a client boundary.
 */
export default function DepartmentMemberRightsToggle({
  departmentId,
  userId,
  isLead,
  initialRead,
  initialEdit,
  cellKind,
  labels,
}: {
  departmentId: string;
  userId: string;
  isLead: boolean;
  initialRead: boolean;
  initialEdit: boolean;
  cellKind: "read" | "edit";
  labels: { failed: string; readAria: string; editAria: string };
}) {
  const [readChecked, setReadChecked] = useState(initialRead);
  const [editChecked, setEditChecked] = useState(initialEdit);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (isLead) {
    return (
      <span
        aria-label={
          cellKind === "read" ? labels.readAria : labels.editAria
        }
        className="inline-block w-full text-center text-volt-700"
        title="Lead — implicit"
      >
        ✓
      </span>
    );
  }

  const checked = cellKind === "read" ? readChecked : editChecked;

  function toggle() {
    const nextRead = cellKind === "read" ? !readChecked : readChecked;
    const nextEdit = cellKind === "edit" ? !editChecked : editChecked;
    const coercedRead = nextRead || nextEdit;
    setReadChecked(coercedRead);
    setEditChecked(nextEdit);
    setError(null);
    start(async () => {
      try {
        await setDepartmentMemberRights(departmentId, userId, {
          can_read: coercedRead,
          can_edit: nextEdit,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
        setReadChecked(initialRead);
        setEditChecked(initialEdit);
      }
    });
  }

  return (
    <span className="inline-flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={toggle}
        disabled={pending}
        aria-label={cellKind === "read" ? labels.readAria : labels.editAria}
        className="h-4 w-4 rounded border-slate-300 text-volt-600 focus:ring-volt-500"
      />
      {error && (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
