import { T } from "@/components/T";

export default function HelpReview() {
  return (
    <>
      <h1>
        <T>Review &amp; approve</T>
      </h1>
      <h2>
        <T>Status workflow</T>
      </h2>
      <p>
        <T>
          Documents move through four states: draft → review → approved →
          optionally archived.
        </T>
      </p>
      <h2>
        <T>Sending to review</T>
      </h2>
      <p>
        <T>
          From the editor toolbar, click Send to review. Members and
          translators can now read and comment, but the public library still
          does not show the document.
        </T>
      </p>
      <h2>
        <T>Approving</T>
      </h2>
      <p>
        <T>
          Admins (or the document owner if granted) click Approve. The
          document becomes visible at /library/&lt;slug&gt; with no login
          required.
        </T>
      </p>
      <h2>
        <T>Archiving</T>
      </h2>
      <p>
        <T>
          Outdated approved documents can be archived. They disappear from the
          public library but remain in the audit trail and can be restored.
        </T>
      </p>
    </>
  );
}
