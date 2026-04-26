export default function HelpCreateDocument() {
  return (
    <>
      <h1>Create a document</h1>
      <p>Editors and admins can create new policy documents.</p>
      <h2>Required prefix information</h2>
      <ul>
        <li><strong>Title</strong> — concise, used as the slug for public URLs.</li>
        <li><strong>Type</strong> — policy, position, resolution, statement, motion.</li>
        <li><strong>Language</strong> — original language of the document.</li>
        <li><strong>Purpose</strong> — one sentence about why this exists.</li>
        <li><strong>Tags</strong> — comma-separated topical labels (e.g. climate, eu).</li>
      </ul>
      <h2>Body editing</h2>
      <p>
        The editor supports headings, bold, italic, underline, lists, quotes,
        code, and links. Per the Volt brand guidelines, only structural
        formatting is allowed — colors and fonts are restricted to keep the
        library visually consistent.
      </p>
      <h2>Saving versions</h2>
      <p>
        Each <strong>Save new version</strong> click writes an immutable snapshot
        with your change summary. Documents in <code>review</code> or
        <code>approved</code> status require a non-empty change summary.
      </p>
    </>
  );
}
