-- 018_geographic_scope_optional.sql
--
-- Flip the seeded `geographic_scope` metadata field from required to
-- optional. The original 017 seed had it required, but Mart wants
-- creating a doc to be friction-free; required prefix info is now
-- limited to Title + Purpose + Scope (group/department).
--
-- Idempotent: re-running just no-ops because the value is already
-- false.

begin;

update public.metadata_fields
   set required = false
 where key = 'geographic_scope';

commit;
