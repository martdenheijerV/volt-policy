import { T } from "@/components/T";

export default function HelpExport() {
  return (
    <>
      <h1>
        <T>Export &amp; print</T>
      </h1>
      <p>
        <T>
          Every document is exportable in a vendor-neutral format from the
          action menu — that&apos;s the Volt commitment to portability and
          to the EU Data Act. The same content, three shapes:
        </T>
      </p>

      <h2>
        <T>File formats</T>
      </h2>
      <ul>
        <li>
          <T>
            Markdown (.md) — plain-text, version-control friendly. Good for
            piping into a static-site generator or diffing across
            revisions.
          </T>
        </li>
        <li>
          <T>
            HTML (.html) — the styled document, self-contained. Open in any
            browser, embed on a website.
          </T>
        </li>
        <li>
          <T>
            Word (.docx) — for sharing with people who don&apos;t have a
            Volt Policy login. Headings, font sizes and lists round-trip
            cleanly between the editor and Word.
          </T>
        </li>
      </ul>

      <h2>
        <T>Print &amp; PDF</T>
      </h2>
      <p>
        <T>
          Use the Print button or Ctrl/Cmd+P. The print stylesheet hides
          the navigation bar, toolbar, comments column and any toasts —
          you get a clean A4 page with the document body, a small footer
          showing the version number and the export date.
        </T>
      </p>
      <p>
        <T>
          The page-break visualisation in the editor matches what comes
          out of the printer: each grey gap on screen is exactly where the
          paper page ends.
        </T>
      </p>

      <h2>
        <T>Programmatic access</T>
      </h2>
      <p>
        <T>
          All data is exposed through the same Postgres rows the UI reads —
          that&apos;s the single-source-of-truth principle in action. SQL
          access lives behind the auth layer; programmatic clients can
          either log in via OIDC and use the JSON endpoints under
          /api/* or run read-only reports directly against the
          read-replica when one is provisioned.
        </T>
      </p>
      <p>
        <T>
          For SCIM-driven user provisioning, see the Roles &amp;
          permissions page.
        </T>
      </p>
    </>
  );
}
