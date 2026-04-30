"use server";

// Deprecated. Migration 015_scoped_permissions retired the
// group_doc_permissions matrix. The new model lives in
// user_group_member_permissions + department_member_permissions and
// the actions for those tables are colocated with /admin/groups/<id>
// and /admin/departments/<id>. This stub stays so any straggler
// import resolves; it doesn't write anything.
export async function setDocTypePermission(): Promise<{
  ok: false;
  error: string;
}> {
  return {
    ok: false,
    error:
      "Document-type permissions are deprecated. Use working-group or department membership instead.",
  };
}
