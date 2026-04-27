import { T } from "@/components/T";

export default function HelpRoles() {
  return (
    <>
      <h1>
        <T>Roles &amp; permissions</T>
      </h1>
      <h2>
        <T>Built-in roles</T>
      </h2>
      <ul>
        <li>
          <T>admin — manage users, groups, metadata, approve docs.</T>
        </li>
        <li>
          <T>editor — create, edit, archive any document.</T>
        </li>
        <li>
          <T>
            member — read review/approved docs, comment, propose amendments.
          </T>
        </li>
        <li>
          <T>translator — read all docs, edit translations only.</T>
        </li>
      </ul>
      <h2>
        <T>Per-document overrides</T>
      </h2>
      <p>
        <T>
          From the document menu, owners and admins can grant a specific user
          edit or comment access to that single document.
        </T>
      </p>
      <h2>
        <T>Group permissions</T>
      </h2>
      <p>
        <T>
          Admins can create user groups (e.g. &ldquo;Climate working
          group&rdquo;) and assign default read/edit rules per document type
          and status.
        </T>
      </p>
      <h2>
        <T>SCIM provisioning</T>
      </h2>
      <p>
        <T>
          Volt Auth can sync users automatically via SCIM v2 endpoints under
          /api/scim/v2/ (bearer token SCIM_TOKEN).
        </T>
      </p>
      <h2>
        <T>GDPR</T>
      </h2>
      <p>
        <T>
          When a user account is deleted, an admin chooses between keep name
          on comments or anonymize comments. Either way the comment body is
          preserved for the audit trail.
        </T>
      </p>
    </>
  );
}
