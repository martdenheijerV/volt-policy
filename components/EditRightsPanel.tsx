"use client";

import { useState, useTransition } from "react";
import {
  requestEditRights,
  decideEditRequest,
  cancelEditRequest,
  grantEditRights,
  revokeEditRights,
} from "@/app/(app)/documents/edit-rights-actions";

/**
 * Strings the panel renders. All translations are resolved server-side
 * and passed as props (RSC-safe — no functions cross the boundary).
 */
export interface EditRightsPanelLabels {
  // Headers
  panelHeading: string;
  // Requester-side
  youAreInSuggestionMode: string;
  requestEditRights: string;
  requesting: string;
  yourPendingRequest: string;
  cancelRequest: string;
  messagePlaceholder: string;
  // Approver-side
  pendingRequestsHeading: string;
  noPendingRequests: string;
  approve: string;
  reject: string;
  decisionNotePlaceholder: string;
  // Participants list
  participantsHeading: string;
  ownerLabel: string;
  roleLabel: string;
  accessLabel: string;
  canEdit: string;
  canComment: string;
  canApprove: string;
  viaGroupTpl: string; // "via group {name}"
  viaDepartmentTpl: string; // "via department {name}"
  leadLabel: string; // "Lead"
  noOtherParticipants: string;
  revoke: string;
  // Status messages
  failed: string;
  requestedAt: string;
  decisionByTpl: string; // "by {name}"
}

export interface EditRightsRequestRowProps {
  id: string;
  requester_id: string;
  requester_name: string | null;
  message: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
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
  scopeMembers: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_scope_kind: "group" | "department";
    via_scope_id: string;
    via_scope_name: string;
    can_read: boolean;
    can_edit: boolean;
  }>;
  scopeLeads: Array<{
    user_id: string;
    name: string | null;
    role: string | null;
    via_scope_kind: "group" | "department";
    via_scope_id: string;
    via_scope_name: string;
  }>;
}

export default function EditRightsPanel({
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
  myOpenRequest: EditRightsRequestRowProps | null;
  pendingRequests: EditRightsRequestRowProps[];
  participants: DocParticipantsProps;
  labels: EditRightsPanelLabels;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reqMessage, setReqMessage] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [openDecide, setOpenDecide] = useState<string | null>(null);
  const [decideNote, setDecideNote] = useState("");

  function onRequest() {
    setError(null);
    start(async () => {
      const r = await requestEditRights(documentId, reqMessage || null);
      if (!r.ok) setError(r.error ?? labels.failed);
      else {
        setReqMessage("");
        setShowRequestForm(false);
      }
    });
  }

  function onCancel(requestId: string) {
    setError(null);
    start(async () => {
      const r = await cancelEditRequest(requestId);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  function onDecide(
    requestId: string,
    decision: "approved" | "rejected"
  ) {
    setError(null);
    start(async () => {
      const r = await decideEditRequest(requestId, decision, decideNote || null);
      if (!r.ok) setError(r.error ?? labels.failed);
      else {
        setOpenDecide(null);
        setDecideNote("");
      }
    });
  }

  function onRevoke(granteeId: string) {
    setError(null);
    start(async () => {
      const r = await revokeEditRights(documentId, granteeId);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  function onDirectGrant(granteeId: string) {
    setError(null);
    start(async () => {
      const r = await grantEditRights(documentId, granteeId);
      if (!r.ok) setError(r.error ?? labels.failed);
    });
  }

  return (
    <details className="mt-6 rounded-lg border bg-white print:hidden">
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium hover:bg-slate-50">
        {labels.panelHeading}
      </summary>

      <div className="space-y-6 border-t px-5 py-4">
        {error && (
          <div
            role="alert"
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {/*
          Requester-side: I'm not currently editable on this doc.
          Show the request flow + my own pending request (if any).
        */}
        {!currentUserCanEdit && currentUserId && (
          <section aria-labelledby="er-request">
            <h3 id="er-request" className="text-sm font-semibold text-slate-700">
              {labels.youAreInSuggestionMode}
            </h3>

            {myOpenRequest ? (
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="font-medium text-amber-900">
                  {labels.yourPendingRequest}
                </div>
                {myOpenRequest.message && (
                  <p className="mt-1 italic text-amber-800">
                    “{myOpenRequest.message}”
                  </p>
                )}
                <div className="mt-1 text-xs text-amber-800">
                  {labels.requestedAt}{" "}
                  {new Date(myOpenRequest.created_at).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => onCancel(myOpenRequest.id)}
                  disabled={pending}
                  className="mt-2 rounded border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  {labels.cancelRequest}
                </button>
              </div>
            ) : !showRequestForm ? (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="mt-3 rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700"
              >
                {labels.requestEditRights}
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <label htmlFor="er-msg" className="sr-only">
                  {labels.messagePlaceholder}
                </label>
                <textarea
                  id="er-msg"
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={labels.messagePlaceholder}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onRequest}
                    disabled={pending}
                    className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
                  >
                    {pending ? labels.requesting : labels.requestEditRights}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRequestForm(false)}
                    className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/*
          Approver-side: pending requests on this doc. Visible to admin /
          owner / can_approve_doc only (server filters; we just render).
        */}
        {isApprover && (
          <section aria-labelledby="er-pending">
            <h3 id="er-pending" className="text-sm font-semibold text-slate-700">
              {labels.pendingRequestsHeading}
            </h3>
            {pendingRequests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {labels.noPendingRequests}
              </p>
            ) : (
              <ul className="mt-2 divide-y rounded border">
                {pendingRequests.map((r) => (
                  <li key={r.id} className="px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">
                          {r.requester_name ?? r.requester_id}
                        </div>
                        {r.message && (
                          <p className="mt-1 text-sm italic text-slate-700">
                            “{r.message}”
                          </p>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {labels.requestedAt}{" "}
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => onDecide(r.id, "approved")}
                          disabled={pending}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {labels.approve}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenDecide(openDecide === r.id ? null : r.id)
                          }
                          disabled={pending}
                          className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {labels.reject}
                        </button>
                      </div>
                    </div>
                    {openDecide === r.id && (
                      <div className="mt-2 space-y-2">
                        <label
                          htmlFor={`note-${r.id}`}
                          className="sr-only"
                        >
                          {labels.decisionNotePlaceholder}
                        </label>
                        <textarea
                          id={`note-${r.id}`}
                          value={decideNote}
                          onChange={(e) => setDecideNote(e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder={labels.decisionNotePlaceholder}
                          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => onDecide(r.id, "rejected")}
                          disabled={pending}
                          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {labels.reject}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/*
          Participants overview: who has access right now. Always
          visible to anyone who can see the doc (so editors-in-waiting
          can see who they're collaborating with).
        */}
        <section aria-labelledby="er-people">
          <h3 id="er-people" className="text-sm font-semibold text-slate-700">
            {labels.participantsHeading}
          </h3>
          <ul className="mt-2 divide-y rounded border">
            {participants.owner && (
              <li className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {participants.owner.name ?? participants.owner.id}
                  </span>
                  <span className="ml-2 rounded bg-volt-50 px-2 py-0.5 text-xs font-medium text-volt-700">
                    {labels.ownerLabel}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {labels.canEdit}
                </span>
              </li>
            )}
            {participants.permitted.map((p) => (
              <li
                key={p.user_id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-medium">{p.name ?? p.user_id}</span>
                  {p.role && (
                    <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {p.role}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {p.can_edit && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {labels.canEdit}
                    </span>
                  )}
                  {p.can_comment && !p.can_edit && (
                    <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-700">
                      {labels.canComment}
                    </span>
                  )}
                  {isApprover && p.can_edit && (
                    <button
                      type="button"
                      onClick={() => onRevoke(p.user_id)}
                      disabled={pending}
                      className="rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {labels.revoke}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {/* Scope leads — automatically have full rights. */}
            {participants.scopeLeads.map((l) => {
              const tpl =
                l.via_scope_kind === "group"
                  ? labels.viaGroupTpl
                  : labels.viaDepartmentTpl;
              return (
                <li
                  key={`l:${l.user_id}:${l.via_scope_id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{l.name ?? l.user_id}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {tpl.replace("{name}", l.via_scope_name)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">
                      {labels.leadLabel}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {labels.canEdit}
                    </span>
                  </div>
                </li>
              );
            })}
            {/* Scope members — read by default, edit when promoted. */}
            {participants.scopeMembers.map((m) => {
              const tpl =
                m.via_scope_kind === "group"
                  ? labels.viaGroupTpl
                  : labels.viaDepartmentTpl;
              return (
                <li
                  key={`m:${m.user_id}:${m.via_scope_id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{m.name ?? m.user_id}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {tpl.replace("{name}", m.via_scope_name)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    {m.can_edit && (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        {labels.canEdit}
                      </span>
                    )}
                    {m.can_read && !m.can_edit && (
                      <span className="rounded bg-slate-50 px-2 py-0.5 text-slate-700">
                        {labels.canComment}
                      </span>
                    )}
                    {/* Approvers can promote a scope member to a
                        per-doc edit grant — keeps that person's
                        edit-rights on this doc even if the lead
                        later flips can_edit off in the scope. */}
                    {isApprover && !m.can_edit && (
                      <button
                        type="button"
                        onClick={() => onDirectGrant(m.user_id)}
                        disabled={pending}
                        className="rounded border border-volt-300 px-2 py-0.5 text-volt-700 hover:bg-volt-50 disabled:opacity-50"
                      >
                        + {labels.canEdit}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
            {participants.permitted.length === 0 &&
              participants.scopeMembers.length === 0 &&
              participants.scopeLeads.length === 0 &&
              !participants.owner && (
                <li className="px-3 py-3 text-sm text-slate-500">
                  {labels.noOtherParticipants}
                </li>
              )}
          </ul>
        </section>
      </div>
    </details>
  );
}
