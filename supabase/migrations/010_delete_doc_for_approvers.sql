-- 010_delete_doc_for_approvers.sql
--
-- Originally `documents_delete` allowed admins and the doc owner only.
-- Now we also allow policy_leads who can_approve this specific doc —
-- same authorization shape we use for "Re-open for editing" and the
-- review approve/reject buttons. Keeps the governance model
-- consistent: if you can sign off on what gets published, you can
-- also retire the document entirely.
--
-- Cascade behavior: ON DELETE CASCADE on document_versions /
-- document_translations / comments / amendments / document_permissions /
-- document_metadata_values / document_embeddings / document_discussions /
-- citations / edit_rights_requests already wipes everything attached
-- when the parent documents row goes away. Audit_log entries about
-- this doc stay (they reference entity_id by string and have no FK).

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.is_admin()
    or owner_id = public.current_user_id()
    or public.can_approve_doc(id)
  );
