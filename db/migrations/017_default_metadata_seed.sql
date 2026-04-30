-- 017_default_metadata_seed.sql
--
-- Seed a baseline of metadata_fields so every freshly-bootstrapped
-- environment has a sensible "prefix information" set out of the box.
-- Admins can still delete or extend these via /admin/metadata.
--
-- The fields chosen here mirror what Volt working groups have asked
-- for in the spec ("owner, purpose, scope, stakeholders") and stay
-- type-agnostic (applies_to NULL = shows on every doc type). The
-- existing `documents.purpose` column is now also enforced as
-- required at the application layer (see app/(app)/documents/actions.ts).
--
-- Idempotent: ON CONFLICT DO NOTHING on the unique `key` column means
-- re-running adds nothing if the rows already exist.

begin;

insert into public.metadata_fields (key, label, field_type, options, required, applies_to, display_order)
values
  ('geographic_scope',
   'Geographic scope',
   'select',
   '["EU", "National", "Regional", "Local"]'::jsonb,
   false,
   null,
   10),
  ('stakeholders',
   'Stakeholders / target audience',
   'text',
   null,
   false,
   null,
   20),
  ('adoption_deadline',
   'Adoption deadline',
   'date',
   null,
   false,
   null,
   30)
on conflict (key) do nothing;

commit;
