"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  requestEditRights,
  decideEditRequest,
  cancelEditRequest,
  revokeEditRights,
  grantEditRights,
} from "@/app/(app)/documents/edit-rights-actions";

/**
 * Compact access-controls cluster for the document header.
 *
 * Replaces the full-width "Access & edit rights" card that used to sit
 * below the editor. Three jobs in one tight cluster:
 *
 *   1. People indicator — shows "👥 N" with a popover listing every
 *      principal who can read/comment/edit this doc (owner + explicit
 *      grants + group-derived). Approvers can revoke edit grants and
 *      decide pending requests inline.
 *
 *   2. Edit-rights state button — "Request edit rights" / "Pending
 *      request" / "Edit access" depending on the current user's state.
 *
 *   3. Request inline form — small popover that lets the user attach
 *      an optional message to their request.
 *
 * Each popover handles outside-click + Escape close. None of them push
 * the editor down: they're absolutely positioned over the page.
 */
export interface DocAccessControlsLabels {
  // People indicator
  peopleAriaLabel: string; // "Who has access"
  whoHasAccessHeading: string;
  ownerLabel: string;
  canEdit: string;
  canComment: string;
  canApprove: string;
  viaGroupTpl: string; // "via {name}"
  revoke: string;
  promoteToEdit: string;
  noOtherParticipants: string;
  pendingRequestsHeading: string;
  approve: string;
  reject: string;
  decisionNotePlaceholder: string;
  // Edit-rights button
  requestEditRights: string;
  pendingRequest: string;
  editAccess: string;
  cancelRequest: string;
  // Request form
  requestHeading: string;
  messagePlaceholder: string;
  submit: string;
  cancel: string;
  busy: string;
  failed: string;
}

export interface DocParticipantsProps {
  owner: { id: string; name: string | null } | null;
  permitted: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    can_edit: boolean;
    can_comment: boolean;
  }>;
  groupMembers: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_group: string;
    via_group_id: string;
    can_edit: boolean;
    can_comment: boolean;
    can_approve: boolean;
  }>;
}

export interface PendingRequestRow {
  id: string;
  requester_id: string;
  requester_name: string | null;
  message: string | null;
  created_at: string;
}

export interface MyOpenRequestRow {
  id: string;
  message: string | null;
  created_at: string;
}

export default function DocAccessControls({
  documentId,
  currentUserId,
  currentUserCanEdit,
  isApprover,
  myOpenRequest,
  pendingRequests,
  participants,
  labels,
}: {
  documentId: string;
  currentUserId: string | null;
  currentUserCanEdit: boolean;
  isApprover: boolean;
  myOpenRequest: MyOpenRequestRow | null;
  pendingRequests: PendingRequestRow[];
  participants: DocParticipantsProps;
  labels: DocAccessControlsLabels;
}) {
  const peopleRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<HTMLDivElement>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqMessage, setReqMessage] = useState("");
  const [decideNoteOpen, setDecideNoteOpen] = useState<string | null>(null);
  const [decideNote, setDecideNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Close popovers on outside-click + Escape.
  useEffect(() => {
    if (!peopleOpen && !requestOpen) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (peopleOpen && peopleRef.current && !peopleRef.current.contains(t)) {
        setPeopleOpen(false);
      }
      if (requestOpen && requestRef.current && !requestRef.current.contains(t)) {
        setRequestOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setPeopleOpen(false);
        setRequestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [peopleOpen, requestOpen]);

  // Total people count for the indicator. Owner counts once; permitted
  // users counted; group members deduped by user_id (a user could be in
  // multiple groups). Falls back to 0 for new docs.
  const allUserIds = new Set<string>();
  if (participants.owner) allUserIds.add(participants.owner.id);
  for (const p of participants.permitted) allUserIds.add(p.user_id);
  for (const g of participants.groupMembers) allUserIds.add(g.user_id);
  const peopleCount = allUserIds.size;

  function onRequestSubmit() {
    setError(null);
    start(async () => {
      const r = await requestEditRights(documentId, reqMessage || null);
      if (!r.ok) setError(r.error ?? labels.failed);
      else {
        setReqMessage("");
        setRequestOpen(false);
      }
    });
  }

  function onCancelRequest() {
    if (!myOpenRequest) return;
    setError(null);
    start(async () => {
      const r = await cancelEditRequest(myOpenRequest.id);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  function onDecide(reqId: string, decision: "approved" | "rejected") {
    setError(null);
    start(async () => {
      const r = await decideEditRequest(reqId, decision, decideNote || null);
      if (!r.ok) setError(r.error ?? labels.failed);
      else {
        setDecideNoteOpen(null);
        setDecideNote("");
      }
    });
  }

  function onRevoke(userId: string) {
    setError(null);
    start(async () => {
      const r = await revokeEditRights(documentId, userId);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  function onPromote(userId: string) {
    setError(null);
    start(async () => {
      const r = await grantEditRights(documentId, userId);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* People indicator + popover */}
      <div ref={peopleRef} className="relative">
        <button
          type="button"
          onClick={() => setPeopleOpen((v) => !v)}
          aria-label={labels.peopleAriaLabel}
          aria-haspopup="dialog"
          aria-expanded={peopleOpen}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt-500"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{peopleCount}</span>
          {isApprover && pendingRequests.length > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {pendingRequests.length}
            </span>
          )}
        </button>

        {peopleOpen && (
          <div
            role="dialog"
            aria-label={labels.whoHasAccessHeading}
            className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-lg border bg-white shadow-xl"
          >
            <div className="border-b px-4 py-2.5">
              <h3 className="text-sm font-semibold">
                {labels.whoHasAccessHeading}
              </h3>
            </div>
            <ul className="max-h-72 overflow-y-auto divide-y text-sm">
              {participants.owner && (
                <li className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {participants.owner.name ?? participants.owner.id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {labels.ownerLabel}
                    </div>
                  </div>
                  <span className="rounded bg-volt-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-volt-700">
                    {labels.canEdit}
                  </span>
                </li>
              )}
              {participants.permitted.map((p) => (
                <li
                  key={p.user_id}
                  className="flex items-center justify-between gap-2 px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {p.name ?? p.user_id}
                    </div>
                    {p.role && (
                      <div className="text-xs text-slate-500">{p.role}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {p.can_edit && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                        {labels.canEdit}
                      </span>
                    )}
                    {!p.can_edit && p.can_comment && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                        {labels.canComment}
                      </span>
                    )}
                    {isApprover && p.can_edit && (
                      <button
                        type="button"
                        onClick={() => onRevoke(p.user_id)}
                        disabled={pending}
                        className="ml-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {labels.revoke}
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {participants.groupMembers.map((g) => (
                <li
                  key={`g:${g.user_id}:${g.via_group_id}`}
                  className="flex items-center justify-between gap-2 px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {g.name ?? g.user_id}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {labels.viaGroupTpl.replace("{name}", g.via_group)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {g.can_approve && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                        {labels.canApprove}
                      </span>
                    )}
                    {g.can_edit && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                        {labels.canEdit}
                      </span>
                    )}
                    {!g.can_edit && g.can_comment && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                        {labels.canComment}
                      </span>
                    )}
                    {isApprover && !g.can_edit && (
                      <button
                        type="button"
                        onClick={() => onPromote(g.user_id)}
                        disabled={pending}
                        className="ml-1 rounded border border-volt-200 px-1.5 py-0.5 text-[10px] text-volt-700 hover:bg-volt-50 disabled:opacity-40"
                      >
                        + {labels.canEdit}
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {peopleCount === 0 && (
                <li className="px-4 py-3 text-xs text-slate-500">
                  {labels.noOtherParticipants}
                </li>
              )}
            </ul>

            {isApprover && pendingRequests.length > 0 && (
              <div className="border-t bg-amber-50/50 px-4 py-2">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                  {labels.pendingRequestsHeading}
                </h3>
                <ul className="space-y-2">
                  {pendingRequests.map((r) => (
                    <li
                      key={r.id}
                      className="rounded border border-amber-200 bg-white p-2 text-xs"
                    >
                      <div className="font-medium text-slate-800">
                        {r.requester_name ?? r.requester_id}
                      </div>
                      {r.message && (
                        <p className="mt-1 italic text-slate-600">
                          “{r.message}”
                        </p>
                      )}
                      {decideNoteOpen === r.id ? (
                        <div className="mt-2 space-y-1">
                          <textarea
                            rows={2}
                            value={decideNote}
                            onChange={(e) => setDecideNote(e.target.value)}
                            placeholder={labels.decisionNotePlaceholder}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => onDecide(r.id, "rejected")}
                              disabled={pending}
                              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {labels.reject}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDecideNoteOpen(null);
                                setDecideNote("");
                              }}
                              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] hover:bg-slate-50"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => onDecide(r.id, "approved")}
                            disabled={pending}
                            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {labels.approve}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecideNoteOpen(r.id)}
                            className="rounded border border-red-300 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50"
                          >
                            {labels.reject}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800"
              >
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit-rights state button */}
      {currentUserId &&
        (currentUserCanEdit ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
            title={labels.editAccess}
          >
            <span aria-hidden>✓</span>
            {labels.editAccess}
          </span>
        ) : myOpenRequest ? (
          <button
            type="button"
            onClick={onCancelRequest}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            title={labels.cancelRequest}
          >
            <span aria-hidden>⏳</span>
            {labels.pendingRequest}
          </button>
        ) : (
          <div ref={requestRef} className="relative">
            <button
              type="button"
              onClick={() => setRequestOpen((v) => !v)}
              aria-haspopup="dialog"
              aria-expanded={requestOpen}
              className="rounded-full border border-volt-300 bg-volt-50 px-3 py-1 text-xs font-medium text-volt-700 hover:bg-volt-100"
            >
              {labels.requestEditRights}
            </button>
            {requestOpen && (
              <div
                role="dialog"
                aria-label={labels.requestHeading}
                className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border bg-white p-3 shadow-xl"
              >
                <h3 className="text-sm font-semibold">
                  {labels.requestHeading}
                </h3>
                <textarea
                  rows={3}
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  placeholder={labels.messagePlaceholder}
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  maxLength={500}
                  autoFocus
                />
                {error && (
                  <p
                    role="alert"
                    className="mt-1 text-xs text-red-700"
                  >
                    {error}
                  </p>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestOpen(false);
                      setReqMessage("");
                    }}
                    className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
                  >
                    {labels.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={onRequestSubmit}
                    disabled={pending}
                    className="rounded bg-volt-600 px-3 py-1 text-xs font-medium text-white hover:bg-volt-700 disabled:opacity-50"
                  >
                    {pending ? labels.busy : labels.submit}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
