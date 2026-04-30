-- 002_first_user_is_admin.sql
--
-- The very first profile created in an empty install becomes admin
-- automatically. Subsequent users default to 'member'. Admins can
-- promote them via the admin UI.
--
-- (After migration 005 the OIDC callback in lib/auth/* handles this
-- explicitly and this trigger is no longer the source of truth, but
-- the function stays in place as a fallback.)

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
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when user_count = 0 then 'admin'::public.user_role else 'member'::public.user_role end
  );
  return new;
end;
$$;
