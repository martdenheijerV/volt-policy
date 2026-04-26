"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "./actions";
import { deleteUserGdpr } from "@/app/(app)/documents/actions";
import type { Profile, UserRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function UserRow({ profile }: { profile: Profile }) {
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as UserRole;
    start(async () => {
      try {
        await setUserRole(profile.id, newRole);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to update role");
      }
    });
  }

  function handleDelete(mode: "keep_name" | "anonymize") {
    start(async () => {
      try {
        await deleteUserGdpr(profile.id, mode);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 font-medium">
          {profile.full_name ?? <em className="text-slate-400">Unnamed</em>}
        </td>
        <td className="px-4 py-3">
          <select
            defaultValue={profile.role}
            onChange={onChange}
            disabled={pending}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="member">member</option>
            <option value="translator">translator</option>
          </select>
        </td>
        <td className="px-4 py-3 uppercase">{profile.language_pref}</td>
        <td className="px-4 py-3 text-slate-500">
          {formatDate(profile.created_at)}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </td>
      </tr>
      {confirmDelete && (
        <tr>
          <td colSpan={5} className="bg-red-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-red-900">
                Delete {profile.full_name ?? "user"}?
              </strong>
              <span className="text-sm text-slate-700">
                Their comments stay for the audit trail. Choose how to handle
                their name:
              </span>
              <button
                type="button"
                onClick={() => handleDelete("keep_name")}
                disabled={pending}
                className="rounded bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
              >
                Keep name
              </button>
              <button
                type="button"
                onClick={() => handleDelete("anonymize")}
                disabled={pending}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Anonymize
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-600 hover:underline"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
