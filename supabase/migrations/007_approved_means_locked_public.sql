-- 007_approved_means_locked_public.sql
--
-- Cleaner approved-state semantics:
--
--  * `approved` = the document has at least one publicly-published
--    version. The public layer reads `document_versions[approved_version_number]`,
--    NOT `current_content`. This means an editor can re-open an approved
--    doc, edit, send to review again, and the public keeps seeing the
--    last-approved snapshot until a new one is approved.
--
--  * Editing an approved doc requires going through `draft` again. The
--    "Re-open for editing" button on the doc page calls a server action
--    that sets status='draft' (keeping approved_version_number intact).
--    Subsequent saves create new versions; current_version diverges from
--    approved_version_number. Re-approval flips status back to 'approved'
--    and bumps approved_version_number to the new current_version.
--
--  * Archived docs stay hidden from the public regardless of whether
--    they were ever approved.
--
-- The change is purely an RLS policy update — no schema columns touched.

drop policy if exists "documents_public_read_approved" on public.documents;
create policy "documents_public_read_approved" on public.documents
  for select using (
    approved_version_number is not null
    and status <> 'archived'
  );

-- Same for document_versions: a public reader needs to be able to fetch
-- the specific approved snapshot from document_versions, even for docs
-- whose current status is 'draft' (mid re-edit). Original policy filtered
-- the parent doc on status='approved' which now collapses re-editing
-- approved docs out of the public layer; mirror the new shape.
drop policy if exists "document_versions_public_read_approved" on public.document_versions;
create policy "document_versions_public_read_approved" on public.document_versions
  for select using (
    exists (
      select 1 from public.documents d
       where d.id = document_versions.document_id
         and d.approved_version_number is not null
         and d.status <> 'archived'
    )
  );
