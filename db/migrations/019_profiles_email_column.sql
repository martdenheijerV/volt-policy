-- 019_profiles_email_column.sql
--
-- Promote the `profiles.email` column from a runtime-added side-
-- effect inside createExternalUser to a proper schema migration.
-- Without this, the action log was filling up with NOTICE messages:
--   column "email" of relation "profiles" already exists, skipping
-- because the action ran `alter table … add column if not exists`
-- on every invocation.
--
-- Also adds a unique index so we can safely look up users by email
-- (used by the GDPR delete flow + the OIDC profile-upsert).
--
-- Idempotent: re-running is a no-op.

begin;

alter table public.profiles
  add column if not exists email text;

-- Email is normalised to lowercase elsewhere; partial unique index
-- avoids a collision with rows where email is still NULL (the
-- legacy SSO users that haven't been touched by the new flow yet).
create unique index if not exists profiles_email_key
  on public.profiles (lower(email))
  where email is not null;

commit;
