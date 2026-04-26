export default function HelpHome() {
  return (
    <>
      <h1>Welcome to Volt Policy</h1>
      <p>
        Volt Policy is the single source of truth for all Volt political documents.
        It supports drafting, reviewing, approving, translating, exporting and
        publishing policies, positions, resolutions, statements and motions.
      </p>
      <h2>Getting started in 60 seconds</h2>
      <ol>
        <li>
          From the <strong>Documents</strong> tab click <em>+ New document</em>,
          give it a title, type and purpose, then save.
        </li>
        <li>
          Edit the body using the rich-text toolbar. Every save creates an
          immutable version with your <em>change summary</em> for the audit
          trail.
        </li>
        <li>
          When ready, click <strong>Send to review</strong>. Other members can
          comment, propose amendments, or translate.
        </li>
        <li>
          An <strong>admin</strong> approves the document, which makes it appear
          in the public library at <code>/library</code>.
        </li>
      </ol>
      <h2>Looking for something specific?</h2>
      <p>Use the menu on the left to jump to a workflow guide.</p>
    </>
  );
}
