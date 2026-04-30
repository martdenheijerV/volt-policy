import { T } from "@/components/T";

export default function HelpRoles() {
  return (
    <>
      <h1>
        <T>Roles &amp; permissions</T>
      </h1>
      <p>
        <T>
          Access in Volt Policy is layered: a built-in role gives you
          baseline access, group memberships expand it, and per-document
          overrides give a single user extra access on a single document.
          The same row-level rules guard the editor, the public library,
          the export endpoints and the API.
        </T>
      </p>

      <h2>
        <T>Built-in roles</T>
      </h2>
      <ul>
        <li>
          <T>
            admin — full read/write across every document; manages users,
            groups, metadata fields, and approves documents. Sees the audit
            log.
          </T>
        </li>
        <li>
          <T>
            editor — creates, edits and archives any document; sees the
            review queue.
          </T>
        </li>
        <li>
          <T>
            member — reads documents in review and approved, comments,
            proposes amendments, supports amendments.
          </T>
        </li>
        <li>
          <T>
            translator — reads everything, edits only the translation
            columns, can mark translations as verified.
          </T>
        </li>
      </ul>

      <h2>
        <T>Per-document overrides</T>
      </h2>
      <p>
        <T>
          From the document&apos;s Permissions menu, owners and admins can
          grant a specific user edit, comment-only, or read access to a
          single document — useful when a member of a working group needs
          to draft a position outside their normal role.
        </T>
      </p>

      <h2>
        <T>Group permissions</T>
      </h2>
      <p>
        <T>
          Admins create user groups (e.g. Climate working group, Brussels
          office, Translators-NL) under Settings → Groups, and assign
          default read / edit rules per document type and status. A user
          belongs to as many groups as needed; effective permissions are
          the union.
        </T>
      </p>

      <h2>
        <T>Sign-in &amp; SCIM</T>
      </h2>
      <p>
        <T>
          Authentication uses OIDC via Volt Auth. The login screen offers
          Continue with Volt Auth as the primary path; an email/password
          fallback exists for ops recovery and is hidden from the
          member-facing UI in production.
        </T>
      </p>
      <p>
        <T>
          Volt Auth can also push user lifecycle events (new joiner,
          changed role, leaver) automatically via SCIM v2 endpoints under
          /api/scim/v2/. The bearer token is configured server-side as
          SCIM_TOKEN.
        </T>
      </p>

      <h2>
        <T>GDPR &amp; deletion</T>
      </h2>
      <p>
        <T>
          When a user account is deleted, an admin chooses between Keep
          name on past contributions or Anonymize past contributions.
          Either way comment bodies, amendments and version snapshots are
          preserved — the audit trail stays intact, only the cached
          author display name changes (or stays). Re-creating the same
          user later does not re-attach old contributions.
        </T>
      </p>

      <h2>
        <T>Audit log</T>
      </h2>
      <p>
        <T>
          Privileged actions (role change, status transition to or from
          approved, GDPR deletion, group permission change, bulk export,
          AI call on a non-public document) write a row to the audit log.
          Admins can browse it under Settings → Audit log; the table is
          read-only and append-only.
        </T>
      </p>
    </>
  );
}
