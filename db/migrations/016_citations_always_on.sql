-- 016_citations_always_on.sql
--
-- Citations / "Bronnen" became an always-on feature: every document
-- gets the Bronnen tab automatically, no opt-in checkbox at creation.
-- The schema column `documents.citations_enabled` stays around for
-- backward compatibility with anything that still reads it, but is
-- now always set to true on existing rows and defaults to true for
-- new rows.
--
-- Two changes:
--   1. Backfill: flip every existing doc to citations_enabled = true.
--   2. Default: change the column default from false (or whatever it
--      was) to true so any legacy code path that omits the value
--      lands in the always-on lane.
--
-- Idempotent: re-running is a no-op.

begin;

update public.documents
   set citations_enabled = true
 where citations_enabled is distinct from true;

alter table public.documents
  alter column citations_enabled set default true;

commit;
