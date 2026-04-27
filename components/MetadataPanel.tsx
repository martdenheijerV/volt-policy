"use client";

import { useState, useTransition } from "react";
import { setMetadataValue } from "@/app/(app)/documents/actions";

interface Field {
  id: string;
  key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "boolean";
  options: { choices?: string[] } | null;
  required: boolean;
}

export interface MetadataPanelLabels {
  metadata: string;
  failed: string;
}

export default function MetadataPanel({
  documentId,
  fields,
  values,
  canEdit,
  labels,
}: {
  documentId: string;
  fields: Field[];
  values: Record<string, string>;
  canEdit: boolean;
  labels: MetadataPanelLabels;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm print:hidden">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
        {labels.metadata}
      </h2>
      <dl className="mt-3 grid gap-2 text-sm">
        {fields.map((f) => (
          <Row
            key={f.id}
            field={f}
            value={values[f.id] ?? ""}
            documentId={documentId}
            canEdit={canEdit}
            labels={labels}
          />
        ))}
      </dl>
    </div>
  );
}

function Row({
  field,
  value,
  documentId,
  canEdit,
  labels,
}: {
  field: Field;
  value: string;
  documentId: string;
  canEdit: boolean;
  labels: MetadataPanelLabels;
}) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function commit() {
    if (v === value) return;
    start(async () => {
      try {
        await setMetadataValue(documentId, field.id, v);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        alert(e instanceof Error ? e.message : labels.failed);
      }
    });
  }

  return (
    <div className="grid grid-cols-3 items-center gap-2">
      <dt className="col-span-1 text-xs text-slate-500">{field.label}</dt>
      <dd className="col-span-2">
        {!canEdit ? (
          <span className="text-sm text-slate-700">{value || "—"}</span>
        ) : field.field_type === "select" ? (
          <select
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={commit}
            disabled={pending}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">—</option>
            {(field.options?.choices ?? []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : field.field_type === "boolean" ? (
          <input
            type="checkbox"
            checked={v === "true"}
            onChange={(e) => {
              const next = e.target.checked ? "true" : "false";
              setV(next);
              start(async () => {
                await setMetadataValue(documentId, field.id, next);
                setSaved(true);
                setTimeout(() => setSaved(false), 1500);
              });
            }}
          />
        ) : (
          <input
            type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onBlur={commit}
            disabled={pending}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        )}
        {saved && <span className="ml-2 text-xs text-green-700">✓</span>}
      </dd>
    </div>
  );
}
