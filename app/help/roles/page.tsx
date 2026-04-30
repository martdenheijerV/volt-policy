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
        <T>The four roles</T>
      </h2>
      <p>
        <T>
          As of migration 014 Volt Policy uses four roles. The old
          `member` and `translator` roles were retired and existing
          accounts auto-migrated to editor; translation work is now
          done by editors with access to the relevant document.
        </T>
      </p>
      <ul>
        <li>
          <T>
            admin — full read/write across every document; manages
            users, groups, document-type access, departments and
            metadata fields. Sees the audit log.
          </T>
        </li>
        <li>
          <T>
            editor — the default starter role. Anyone added to a group
            is an editor by default and gets the group&apos;s configured
            access (read / edit, per document type). Editors create,
            edit and archive documents within their reach.
          </T>
        </li>
        <li>
          <T>
            policy_lead — assigned by an admin to one or more working
            groups (Climate WG, Brussels office, ...). Inside those
            groups, full management rights including approving
            documents and adding/removing members. Outside, falls
            back to editor rights.
          </T>
        </li>
        <li>
          <T>
            policy_lead_department — assigned by an admin to one or
            more departments (organisational units: Volt EP, Volt
            Nederland, Volt Maastricht, ...). Inside their department,
            full management rights — same as policy_lead, but the
            scope is the department instead of a topical working
            group. Outside, falls back to editor rights.
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
        <T>Departments &amp; groups</T>
      </h2>
      <p>
        <T>
          Volt Policy uses two orthogonal layers:
        </T>
      </p>
      <ul>
        <li>
          <T>
            Departments — organisational units (Volt Europa, Volt EP,
            Volt Nederland, Volt Duitsland, Volt Maastricht, ...).
            Managed under Beheer → Personen. Each department can have
            one or more policy_lead_department leads, assigned by an
            admin. Documents are optionally tagged with a department,
            which is what gives the lead their scoped rights.
          </T>
        </li>
        <li>
          <T>
            Groups — topic-based working groups (Climate WG, Brussels
            office, Translators-NL, ...). Managed under Beheer →
            Groepen. Each group has members and (optionally) per-group
            policy_lead leads. Default read / edit access per document
            type for a group is configured on the Document types tab,
            which presents a matrix of (group × type) toggles.
          </T>
        </li>
      </ul>
      <p>
        <T>
          A user can belong to one department and to as many groups as
          needed. Effective permissions are the union of (built-in
          role) + (department-scoped lead rights, if any) + (group
          membership rules) + (per-document overrides).
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
