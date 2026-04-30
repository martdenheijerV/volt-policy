"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "./actions";
import { deleteUserGdpr } from "@/app/(app)/documents/actions";
import type { Profile, UserRole } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export interface UserRowLabels {
  unnamed: string;
  delete: string;
  /** Template "Delete {name}?" — {name} is replaced client-side. */
  deleteConfirmHeadingTpl: string;
  deleteConfirmBody: string;
  keepName: string;
  anonymize: string;
  cancel: string;
  failedToUpdateRole: string;
  failed: string;
  fallbackUser: string;
}

export default function UserRow({
  profile,
  labels,
}: {
  profile: Profile;
  labels: UserRowLabels;
}) {
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
        alert(err instanceof Error ? err.message : labels.failedToUpdateRole);
      }
    });
  }

  function handleDelete(mode: "keep_name" | "anonymize") {
    start(async () => {
      try {
        await deleteUserGdpr(profile.id, mode);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-3 font-medium">
          {profile.full_name ?? (
            <em className="text-slate-400">{labels.unnamed}</em>
          )}
        </td>
        <td className="px-4 py-3">
          <select
            defaultValue={profile.role}
            onChange={onChange}
            disabled={pending}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {/*
              Four roles only — `member` and `translator` were retired
              in migration 014. Existing rows with those roles get
              auto-migrated to `editor` on apply, but an admin browsing
              the list before redeploy might still see them in the
              defaultValue; render them as disabled options so the
              dropdown shows the current value without inviting new
              assignments.
            */}
            <option value="admin">admin</option>
            <option value="editor">editor</option>
            <option value="policy_lead">policy_lead</option>
            <option value="policy_lead_department">policy_lead_department</option>
            {profile.role === "member" && (
              <option value="member" disabled>
                member (legacy)
              </option>
            )}
            {profile.role === "translator" && (
              <option value="translator" disabled>
                translator (legacy)
              </option>
            )}
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
            {labels.delete}
          </button>
        </td>
      </tr>
      {confirmDelete && (
        <tr>
          <td colSpan={5} className="bg-red-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <strong className="text-red-900">
                {labels.deleteConfirmHeadingTpl.replace(
                  "{name}",
                  profile.full_name ?? labels.fallbackUser
                )}
              </strong>
              <span className="text-sm text-slate-700">
                {labels.deleteConfirmBody}
              </span>
              <button
                type="button"
                onClick={() => handleDelete("keep_name")}
                disabled={pending}
                className="rounded bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
              >
                {labels.keepName}
              </button>
              <button
                type="button"
                onClick={() => handleDelete("anonymize")}
                disabled={pending}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                {labels.anonymize}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-600 hover:underline"
              >
                {labels.cancel}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
