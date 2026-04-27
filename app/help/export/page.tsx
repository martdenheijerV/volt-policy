import { T } from "@/components/T";

export default function HelpExport() {
  return (
    <>
      <h1>
        <T>Export &amp; print</T>
      </h1>
      <p>
        <T>
          Every document can be exported in three formats from the action
          menu:
        </T>
      </p>
      <ul>
        <li>
          <T>Markdown (.md) — plain-text, version-control friendly.</T>
        </li>
        <li>
          <T>HTML (.html) — styled web export.</T>
        </li>
        <li>
          <T>Word (.docx) — for sharing externally.</T>
        </li>
      </ul>
      <p>
        <T>
          For printing or saving to PDF, use the Print button or Ctrl/Cmd+P.
          The print stylesheet hides navigation, toolbars, and the comments
          panel.
        </T>
      </p>
      <h2>
        <T>EU Data Act API</T>
      </h2>
      <p>
        <T>
          All data is also exposed via Supabase&apos;s auto-generated REST API
          for programmatic access. See /api/openapi.json for the schema.
        </T>
      </p>
    </>
  );
}
