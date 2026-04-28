-- 009_versions_only_on_approve_autosave.sql
--
-- The "official version" model:
--
--   * Autosave updates `documents.current_content` continuously while
--     somebody types. No version row, no audit row, no email — just the
--     working copy on disk.
--
--   * `document_versions` rows are minted **only** when an admin or
--     policy_lead approves a doc. Version_number sequence is
--     "max(approved) + 1" — V1 is the first sign-off, V2 the second, etc.
--     The admin/lead's audit history equals the version history.
--
--   * Send-to-review no longer creates a candidate version row. The doc
--     is locked via `doc_editable` so current_content can't drift while
--     under review; the approver is reading exactly what's on disk.
--
--   * The proposed change summary travels with the doc as
--     `pending_change_summary` so the approver sees what the editor
--     thinks they changed. On approve it's copied onto the new version
--     row and cleared from the doc; on reject it's cleared too.
--
-- Pure schema add — no data backfill. Existing version rows stay where
-- they are; new approvals number sequentially from there.

alter table public.documents
  add column if not exists pending_change_summary text;

-- Drop the old "must save once before review" implicit assumption: the
-- previous flow needed at least one document_versions row before the
-- send-to-review action would let you proceed. Now you can autosave a
-- fresh doc and ship it straight to review without manually creating
-- a version. No SQL change required for this — just a code-side
-- adjustment in actions.ts (already done in the same commit).

-- Audit-log entry shape stays the same; we just write fewer of them
-- (one per approval instead of one per save).
