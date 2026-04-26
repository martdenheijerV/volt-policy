interface Field {
  id: string;
  key: string;
  label: string;
  field_type: "text" | "number" | "date" | "select" | "boolean";
  options: { choices?: string[] } | null;
  required: boolean;
}

export default function MetadataField({
  field,
  defaultValue,
}: {
  field: Field;
  defaultValue?: string;
}) {
  const id = `meta_${field.key}`;
  const name = `meta_${field.key}`;
  const label = (
    <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-slate-500">
      {field.label} {field.required && <span className="text-red-600">*</span>}
    </label>
  );

  if (field.field_type === "select") {
    return (
      <div>
        {label}
        <select
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          required={field.required}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="">— select —</option>
          {(field.options?.choices ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
    );
  }

  if (field.field_type === "boolean") {
    return (
      <label htmlFor={id} className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={defaultValue === "true"}
          value="true"
        />
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }

  return (
    <div>
      {label}
      <input
        id={id}
        name={name}
        type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
        defaultValue={defaultValue ?? ""}
        required={field.required}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
      />
    </div>
  );
}
