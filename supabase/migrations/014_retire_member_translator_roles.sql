-- 014_retire_member_translator_roles.sql
--
-- Retire the `member` and `translator` roles. Going forward Volt
-- Policy uses four roles only:
--
--   admin
--   editor                    ← new "starter" role; anyone added to
--                                a group gets editor rights by default
--                                (the rights of the group apply on top)
--   policy_lead               ← scoped to one or more working groups
--   policy_lead_department    ← scoped to one or more departments
--
-- Why this migration is data-only (the enum values stay around)
-- -------------------------------------------------------------
-- Postgres can't actually DROP a value from an existing enum without
-- a multi-step type swap (create new type → cast every column →
-- drop old → rename), and the cost of that surgery isn't worth it
-- here. Audit-log rows from before this change may refer to the old
-- roles; keeping the enum values intact preserves their readability
-- in those old rows.
--
-- What this migration *does* enforce:
--
--   1. Move every existing profile with role `member` or `translator`
--      to `editor`. One UPDATE, fully reversible from a backup.
--   2. Switch the default role on `profiles.role` from `member` to
--      `editor` so any future insert that omits the column lands in
--      a valid lane.
--   3. Update the `first_user_is_admin` trigger (migration 002) so
--      late-comer auto-inserts default to editor instead of member.
--
-- Backfill is idempotent (`where role in ('member','translator')`).

-- 1. Backfill existing rows.
update public.profiles
   set role = 'editor'::public.user_role
 where role in ('member'::public.user_role, 'translator'::public.user_role);

-- 2. Change column default.
alter table public.profiles
  alter column role set default 'editor'::public.user_role;

-- 3. Replace the trigger that fired on `auth.users` insert (created
--    in 002) so a freshly-signed-up user becomes editor (or admin
--    if they're the very first user — that branch stays untouched).
--    We re-create the function in place; the trigger itself doesn't
--    need to be re-bound.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count int;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles (id, role, language_pref)
  values (
    new.id,
    case
      when user_count = 0 then 'admin'::public.user_role
      else 'editor'::public.user_role
    end,
    'en'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
