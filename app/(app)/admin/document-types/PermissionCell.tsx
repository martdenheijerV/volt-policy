"use client";

import { useState, useTransition } from "react";
import type { DocType } from "@/lib/types";
import { setDocTypePermission } from "./actions";

/**
 * A single (group × doc_type) cell in the matrix. Two checkboxes:
 *
 *   - Read  — group members can see docs of this type
 *   - Edit  — group members can edit docs of this type
 *
 * Editing implies reading; ticking Edit auto-ticks Read in the UI
 * (the server action enforces it again). Unchecking Read while Edit
 * is still on does not silently drop edit; we toggle Edit off too.
 *
 * Saves are optimistic — the checkbox flips immediately, the server
 * action runs in a transition, and an inline error replaces the
 * cell briefly if the action throws.
 */
export default function PermissionCell({
  groupId,
  docType,
  initialRead,
  initialEdit,
  labels,
}: {
  groupId: string;
  docType: DocType;
  initialRead: boolean;
  initialEdit: boolean;
  labels: { read: string; edit: string; failed: string };
}) {
  const [read, setRead] = useState(initialRead);
  const [edit, setEdit] = useState(initialEdit);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function update(next: { canRead: boolean; canEdit: boolean }) {
    setRead(next.canRead);
    setEdit(next.canEdit);
    setError(null);
    startTransition(async () => {
      try {
        await setDocTypePermission(groupId, docType, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
        // Revert visual state on failure so what you see matches what
        // the server has.
        setRead(initialRead);
        setEdit(initialEdit);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <label className="inline-flex items-center gap-1">
        <input
          type="checkbox"
          checked={read}
          onChange={(e) => {
            const canRead = e.target.checked;
            // Clearing Read also clears Edit (edit implies read).
            update({ canRead, canEdit: canRead && edit });
          }}
          className="h-3.5 w-3.5 rounded border-slate-300 text-volt-600 focus:ring-volt-500"
        />
        <span>{labels.read}</span>
      </label>
      <label className="inline-flex items-center gap-1">
        <input
          type="checkbox"
          checked={edit}
          onChange={(e) => {
            const canEdit = e.target.checked;
            // Edit implies read — auto-tick read when edit goes on.
            update({ canRead: canEdit ? true : read, canEdit });
          }}
          className="h-3.5 w-3.5 rounded border-slate-300 text-volt-600 focus:ring-volt-500"
        />
        <span>{labels.edit}</span>
      </label>
      {error && (
        <span role="alert" className="text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
