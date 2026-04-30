import { T } from "@/components/T";

export default function HelpReview() {
  return (
    <>
      <h1>
        <T>Review &amp; approve</T>
      </h1>
      <p>
        <T>
          Documents move through four states: draft → review → approved →
          optionally archived. Each transition is broadcast live to every
          open tab on the same document, and writes a row to the audit log.
        </T>
      </p>

      <h2>
        <T>Draft</T>
      </h2>
      <p>
        <T>
          Default state for a new document. Only the document&apos;s editor
          and admins can read it. Autosave runs on every keystroke; no
          version snapshot is stamped yet.
        </T>
      </p>

      <h2>
        <T>Sending to review</T>
      </h2>
      <p>
        <T>
          From the action bar below the editor, type a short change summary
          and click Send to review. A confirmation dialog appears (the
          summary is required, so reviewers know what changed since the last
          version), and on confirm the document flips to review. The
          editor locks for non-admins, members and translators can now read
          and comment, and a version snapshot is stamped with your summary.
        </T>
      </p>

      <h2>
        <T>Approving</T>
      </h2>
      <p>
        <T>
          Admins (and document owners with approve permission) see the
          Approve and Reject buttons in the action bar while a document is
          in review. Approve writes a final version snapshot, flips the
          status to approved, and makes the document visible at
          /library/&lt;slug&gt; to anonymous visitors immediately — no sync
          job, the public layer reads the same row.
        </T>
      </p>
      <p>
        <T>
          Reject sends the document back to draft with a reason. The reason
          and the rejector&apos;s name are recorded in the audit log.
        </T>
      </p>

      <h2>
        <T>Archiving</T>
      </h2>
      <p>
        <T>
          Outdated approved documents can be archived from the action bar.
          Archived documents disappear from the public library but stay in
          the dashboard for editors and admins, with all versions, comments
          and amendments intact. Restore is one click.
        </T>
      </p>

      <h2>
        <T>Live status changes</T>
      </h2>
      <p>
        <T>
          When someone in another tab transitions the status, a small
          amber toast appears in the bottom-right corner saying who set
          the status to what. The page auto-refreshes underneath so the
          editor lock state, version list and action bar all reflect the
          new status without a manual reload.
        </T>
      </p>
    </>
  );
}
