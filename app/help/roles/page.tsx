export default function HelpRoles() {
  return (
    <>
      <h1>Roles &amp; permissions</h1>
      <h2>Built-in roles</h2>
      <ul>
        <li><strong>admin</strong> — manage users, groups, metadata, approve docs.</li>
        <li><strong>editor</strong> — create, edit, archive any document.</li>
        <li><strong>member</strong> — read review/approved docs, comment, propose amendments.</li>
        <li><strong>translator</strong> — read all docs, edit translations only.</li>
      </ul>
      <h2>Per-document overrides</h2>
      <p>
        From the document menu, owners and admins can grant a specific user
        edit or comment access to that single document.
      </p>
      <h2>Group permissions</h2>
      <p>
        Admins can create user groups (e.g. &ldquo;Climate working group&rdquo;)
        and assign default read/edit rules per document type and status.
      </p>
      <h2>SCIM provisioning</h2>
      <p>
        Volt Auth can sync users automatically via SCIM v2 endpoints under
        <code>/api/scim/v2/</code> (bearer token <code>SCIM_TOKEN</code>).
      </p>
      <h2>GDPR</h2>
      <p>
        When a user account is deleted, an admin chooses between
        <em>keep name on comments</em> or <em>anonymize comments</em>. Either way
        the comment body is preserved for the audit trail.
      </p>
    </>
  );
}
