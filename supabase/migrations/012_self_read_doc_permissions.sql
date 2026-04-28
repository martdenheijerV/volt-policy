-- 012_self_read_doc_permissions.sql
--
-- Bug: after an approver granted edit-rights to a user, the document
-- page still showed the "Request edit rights" button instead of
-- "✓ Access to edit". The doc itself was actually editable — the user
-- could type — because doc_editable() (SECURITY DEFINER) bypasses RLS
-- and saw the new document_permissions row. But the page-level select
-- on document_permissions came back empty: the table only had policies
-- for admins and the doc owner, never the grantee themselves.
--
-- Fix: let users read their own permission row. Read-only — they still
-- can't insert/update/delete (those go through the document_permissions
-- table by the approver-side server actions).

create policy "perms_self_read" on public.document_permissions
  for select using (user_id = public.current_user_id());
