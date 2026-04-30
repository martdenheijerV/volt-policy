"use client";

import { useState, useTransition } from "react";
import { createExternalUser } from "./actions";
import type { UserRole } from "@/lib/types";

export interface AddExternalUserFormLabels {
  openButton: string;
  successHeading: string;
  successBody: string;
  loginUrl: string;
  username: string;
  tempPassword: string;
  firstLoginNote: string;
  close: string;
  addAnother: string;
  formHeading: string;
  formIntro: string;
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  role: string;
  roleMember: string;
  roleEditor: string;
  rolePolicyLead: string;
  rolePolicyLeadDepartment: string;
  roleTranslator: string;
  roleAdmin: string;
  creating: string;
  create: string;
  cancel: string;
}

/**
 * Inline form for admins to create an external user that doesn't sit in any
 * Volt SSO directory. On success it shows a one-time temp password — once
 * dismissed, it can't be retrieved again.
 */
export default function AddExternalUserForm({
  labels,
}: {
  labels: AddExternalUserFormLabels;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("editor");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; username: string; tempPassword: string; loginUrl: string }
    | { ok: false; error: string }
    | null
  >(null);

  function reset() {
    setName("");
    setEmail("");
    setRole("editor");
    setResult(null);
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const res = await createExternalUser({ name, email, role });
      setResult(res);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-volt-600 px-3 py-2 text-sm font-medium text-white hover:bg-volt-700"
      >
        + {labels.openButton}
      </button>
    );
  }

  if (result?.ok) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded border border-emerald-300 bg-emerald-50 p-4 text-sm"
      >
        <p className="font-medium text-emerald-900">
          ✓ {labels.successHeading}
        </p>
        <p className="mt-2 text-slate-700">{labels.successBody}</p>
        <dl className="mt-3 grid gap-2 text-slate-800 sm:grid-cols-[120px_1fr]">
          <dt className="font-medium">{labels.loginUrl}</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5">
              {result.loginUrl}
            </code>
          </dd>
          <dt className="font-medium">{labels.username}</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5">
              {result.username}
            </code>
          </dd>
          <dt className="font-medium">{labels.tempPassword}</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5 font-mono">
              {result.tempPassword}
            </code>
          </dd>
        </dl>
        <p className="mt-3 text-xs text-slate-600">{labels.firstLoginNote}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            {labels.close}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            {labels.addAnother}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-medium">{labels.formHeading}</h3>
      <p className="mt-1 text-xs text-slate-600">{labels.formIntro}</p>

      {result && !result.ok && (
        <p
          role="alert"
          className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {result.error}
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            {labels.name}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={labels.namePlaceholder}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            {labels.email}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder={labels.emailPlaceholder}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            {labels.role}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="member">{labels.roleMember}</option>
            <option value="editor">{labels.roleEditor}</option>
            <option value="policy_lead">{labels.rolePolicyLead}</option>
            <option value="policy_lead_department">
              {labels.rolePolicyLeadDepartment}
            </option>
            <option value="translator">{labels.roleTranslator}</option>
            <option value="admin">{labels.roleAdmin}</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim() || !email.trim()}
          className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
        >
          {pending ? labels.creating : labels.create}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
