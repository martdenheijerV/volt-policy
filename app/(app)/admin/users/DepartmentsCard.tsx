"use client";

import { useState, useTransition } from "react";
import {
  createDepartment,
  deleteDepartment,
  setDepartmentLead,
} from "./department-actions";

export interface DepartmentsCardLabels {
  heading: string;
  intro: string;
  newDeptName: string;
  description: string;
  namePlaceholder: string;
  add: string;
  noDepts: string;
  leadsHeading: string;
  noLeads: string;
  pickLead: string;
  assign: string;
  remove: string;
  warningWrongRole: string;
  delete: string;
  confirmDeleteTpl: string;
  failed: string;
}

interface Person {
  id: string;
  full_name: string | null;
  role: string;
}

interface DeptWithLeads {
  id: string;
  name: string;
  description: string | null;
  leadIds: string[];
}

/**
 * Departments management card — sits at the bottom of the Personen
 * tab. Lists every department with its current leads, lets admins
 * add a department, delete a department (cascades remove its
 * lead assignments), and assign or unassign individual users as
 * leads.
 *
 * Department leads must have the role `policy_lead_department` for
 * the assignment to grant any rights — we display a soft warning
 * next to leads whose role doesn't match, but allow the assignment
 * so admins can pre-populate before flipping the role.
 */
export default function DepartmentsCard({
  departments,
  people,
  labels,
}: {
  departments: DeptWithLeads[];
  people: Person[];
  labels: DepartmentsCardLabels;
}) {
  return (
    <section
      aria-labelledby="departments-heading"
      className="mt-12 rounded-lg border bg-white p-6"
    >
      <h2 id="departments-heading" className="text-xl font-semibold">
        {labels.heading}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{labels.intro}</p>

      <CreateDepartmentForm labels={labels} />

      {departments.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {labels.noDepts}
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100">
          {departments.map((d) => (
            <li key={d.id} className="py-4">
              <DepartmentRow
                department={d}
                people={people}
                labels={labels}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateDepartmentForm({
  labels,
}: {
  labels: DepartmentsCardLabels;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setError(null);
    // Hand a real FormData object to the server action — Next.js
    // can't serialise an inline arrow-closure as a form action, but
    // it happily accepts a server action invoked from a button
    // click inside a transition. This keeps the optimistic UX
    // (clear input, surface errors inline) without the
    // <form action={inline}> footgun.
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("description", description.trim());
    startTransition(async () => {
      try {
        await createDepartment(fd);
        setName("");
        setDescription("");
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-slate-50 p-4">
      <div className="flex-1">
        <label
          htmlFor="dept-name"
          className="block text-xs font-medium uppercase tracking-wider text-slate-500"
        >
          {labels.newDeptName}
        </label>
        <input
          id="dept-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={labels.namePlaceholder}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>
      <div className="flex-1">
        <label
          htmlFor="dept-desc"
          className="block text-xs font-medium uppercase tracking-wider text-slate-500"
        >
          {labels.description}
        </label>
        <input
          id="dept-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="rounded bg-volt-600 px-4 py-2 text-sm font-medium text-white hover:bg-volt-700 disabled:opacity-50"
      >
        {labels.add}
      </button>
      {error && (
        <p role="alert" className="basis-full text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function DepartmentRow({
  department,
  people,
  labels,
}: {
  department: DeptWithLeads;
  people: Person[];
  labels: DepartmentsCardLabels;
}) {
  const [picker, setPicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const leads = department.leadIds.map((id) => peopleById.get(id)).filter(Boolean) as Person[];

  function assign(userId: string) {
    if (!userId) return;
    setError(null);
    setPicker("");
    startTransition(async () => {
      try {
        await setDepartmentLead(department.id, userId, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  function unassign(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setDepartmentLead(department.id, userId, false);
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  function destroy() {
    if (!window.confirm(labels.confirmDeleteTpl.replace("{name}", department.name))) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteDepartment(department.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  // Candidates for the dropdown: anyone who isn't already a lead.
  const candidates = people.filter(
    (p) => !department.leadIds.includes(p.id)
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-slate-900">{department.name}</div>
          {department.description && (
            <div className="mt-0.5 text-xs text-slate-500">
              {department.description}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={destroy}
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-red-600"
        >
          {labels.delete}
        </button>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {labels.leadsHeading}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {leads.length === 0 && (
            <span className="text-xs italic text-slate-500">
              {labels.noLeads}
            </span>
          )}
          {leads.map((p) => {
            const wrongRole = p.role !== "policy_lead_department";
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                  wrongRole
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    : "bg-volt-50 text-volt-800 ring-1 ring-volt-200"
                }`}
                title={wrongRole ? labels.warningWrongRole : undefined}
              >
                {p.full_name ?? p.id.slice(0, 8)}
                {wrongRole && <span aria-hidden>⚠</span>}
                <button
                  type="button"
                  onClick={() => unassign(p.id)}
                  aria-label={labels.remove}
                  className="rounded hover:text-red-600"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="sr-only" htmlFor={`dept-${department.id}-pick`}>
            {labels.pickLead}
          </label>
          <select
            id={`dept-${department.id}-pick`}
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">{labels.pickLead}</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.id.slice(0, 8)}
                {p.role !== "policy_lead_department" ? " — wrong role" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => assign(picker)}
            disabled={!picker}
            className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          >
            {labels.assign}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
