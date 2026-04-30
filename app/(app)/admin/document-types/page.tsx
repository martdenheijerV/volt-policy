import { redirect } from "next/navigation";

/**
 * Deprecated route. The doc-type × group matrix was retired by
 * migration 015_scoped_permissions and the new admin layout
 * (Personen / Groepen / Afdelingen). Anyone landing here from a
 * stale bookmark or stale link is bounced to /admin/groups, where
 * the equivalent per-member rights live now.
 *
 * Kept as a redirect (rather than deleted outright) so deep links
 * out in Slack channels / wiki pages don't 404.
 */
export default function DeprecatedDocumentTypesPage() {
  redirect("/admin/groups");
}
