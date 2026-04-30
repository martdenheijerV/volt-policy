"use client";

import { useState, useTransition } from "react";
import { setMemberRights } from "../actions";

/**
 * Per-member rights cell. Renders the can_read + can_edit checkboxes
 * for one (group, user) pair as one cohesive control so the two
 * flags can be sent atomically — flipping one without the other
 * would race with the server's "edit implies read" coercion.
 *
 * Lead-handling: when the member is the group lead the rights are
 * implicit (full) and we render a non-interactive marker for both
 * cells so the column lines up but communicates the implicit grant.
 *
 * Optimistic with rollback-on-error.
 */
export default function MemberRightsToggle({
  groupId,
  userId,
  isLead,
  initialRead,
  initialEdit,
  cellKind,
  labels,
}: {
  groupId: string;
  userId: string;
  isLead: boolean;
  initialRead: boolean;
  initialEdit: boolean;
  // Which checkbox to render. The pair share state via React's
  // re-rendering on the parent row's key — we render two of these
  // components per row, both reading the same source-of-truth row
  // through props.
  cellKind: "read" | "edit";
  labels: { failed: string; readAria: string; editAria: string };
}) {
  // Local state mirrors the prop on first render but lets us paint
  // the optimistic update before the server confirms.
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
    // Edit implies read — coerce locally so optimistic UI stays
    // truthful even before the server enforces the same rule.
    const coercedRead = nextRead || nextEdit;
    setReadChecked(coercedRead);
    setEditChecked(nextEdit);
    setError(null);
    start(async () => {
      try {
        await setMemberRights(groupId, userId, {
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
