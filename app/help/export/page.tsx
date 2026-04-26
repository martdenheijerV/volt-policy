export default function HelpExport() {
  return (
    <>
      <h1>Export &amp; print</h1>
      <p>
        Every document can be exported in three formats from the action menu:
      </p>
      <ul>
        <li><strong>Markdown (.md)</strong> — plain-text, version-control friendly.</li>
        <li><strong>HTML (.html)</strong> — styled web export.</li>
        <li><strong>Word (.docx)</strong> — for sharing externally.</li>
      </ul>
      <p>
        For printing or saving to PDF, use the <strong>Print</strong> button or
        Ctrl/Cmd+P. The print stylesheet hides navigation, toolbars, and the
        comments panel.
      </p>
      <h2>EU Data Act API</h2>
      <p>
        All data is also exposed via Supabase&apos;s auto-generated REST API for
        programmatic access. See <code>/api/openapi.json</code> for the schema.
      </p>
    </>
  );
}
