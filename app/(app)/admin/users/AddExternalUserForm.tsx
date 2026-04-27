"use client";

import { useState, useTransition } from "react";
import { createExternalUser } from "./actions";
import type { UserRole } from "@/lib/types";

/**
 * Inline form for admins to create an external user that doesn't sit in any
 * Volt SSO directory. On success it shows a one-time temp password — once
 * dismissed, it can't be retrieved again.
 */
export default function AddExternalUserForm() {
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
        + Voeg externe gebruiker toe
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
          ✓ Externe gebruiker aangemaakt
        </p>
        <p className="mt-2 text-slate-700">
          Stuur deze gegevens door (vergeet niet: het wachtwoord wordt maar
          één keer getoond).
        </p>
        <dl className="mt-3 grid gap-2 text-slate-800 sm:grid-cols-[120px_1fr]">
          <dt className="font-medium">Login URL</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5">
              {result.loginUrl}
            </code>
          </dd>
          <dt className="font-medium">Username</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5">
              {result.username}
            </code>
          </dd>
          <dt className="font-medium">Tijdelijk wachtwoord</dt>
          <dd>
            <code className="rounded bg-white px-2 py-0.5 font-mono">
              {result.tempPassword}
            </code>
          </dd>
        </dl>
        <p className="mt-3 text-xs text-slate-600">
          Bij de eerste login moet de gebruiker het wachtwoord wijzigen via
          Authentik.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Sluiten
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Nog een gebruiker toevoegen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-medium">Externe gebruiker toevoegen</h3>
      <p className="mt-1 text-xs text-slate-600">
        Voor mensen die niet in een Volt SSO-directory zitten. Ze krijgen een
        Authentik-account met tijdelijk wachtwoord en kunnen daarmee inloggen.
      </p>

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
          <span className="block text-xs font-medium text-slate-600">Naam</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="Voor- en achternaam"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">
            E-mailadres
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            placeholder="naam@voorbeeld.org"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="block text-xs font-medium text-slate-600">Rol</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={pending}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="member">Member (alleen lezen + commenten)</option>
            <option value="editor">Editor (aanmaken + bewerken)</option>
            <option value="translator">Translator (vertaalwerk)</option>
            <option value="admin">Admin (overzicht + approve)</option>
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
          {pending ? "Aanmaken..." : "Aanmaken"}
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
          Annuleren
        </button>
      </div>
    </div>
  );
}
