// Deprecated. The doc-type × group permission matrix was retired by
// migration 015_scoped_permissions; per-member permissions live on
// user_group_member_permissions / department_member_permissions and
// are managed from /admin/groups/<id> and /admin/departments/<id>.
// This stub stays as a no-op export so any lingering import resolves;
// the route page that used it is now a redirect.
export default function PermissionCell() {
  return null;
}
