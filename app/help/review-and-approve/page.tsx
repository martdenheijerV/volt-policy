export default function HelpReview() {
  return (
    <>
      <h1>Review &amp; approve</h1>
      <h2>Status workflow</h2>
      <p>
        Documents move through four states: <code>draft</code> →
        <code>review</code> → <code>approved</code> → optionally
        <code>archived</code>.
      </p>
      <h2>Sending to review</h2>
      <p>
        From the editor toolbar, click <strong>Send to review</strong>. Members
        and translators can now read and comment, but the public library still
        does not show the document.
      </p>
      <h2>Approving</h2>
      <p>
        Admins (or the document owner if granted) click <strong>Approve</strong>.
        The document becomes visible at <code>/library/&lt;slug&gt;</code> with no
        login required.
      </p>
      <h2>Archiving</h2>
      <p>
        Outdated approved documents can be archived. They disappear from the
        public library but remain in the audit trail and can be restored.
      </p>
    </>
  );
}
