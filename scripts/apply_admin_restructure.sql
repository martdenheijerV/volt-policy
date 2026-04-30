-- scripts/apply_admin_restructure.sql
--
-- Combined, idempotent SQL for the Beheer admin restructure:
-- migrations 013a + 013b + 014 in one runnable block. Apply against
-- your self-hosted Postgres on Hetzner with:
--
--   psql "$DATABASE_URL" -f scripts/apply_admin_restructure.sql
--
-- Safe to re-run — every alter / create uses IF NOT EXISTS, every
-- enum addition uses ADD VALUE IF NOT EXISTS, and the seed insert
-- uses ON CONFLICT DO NOTHING.

-- ────────────  013a — enum values  ────────────
alter type public.user_role add value if not exists 'policy_lead';
alter type public.user_role add value if not exists 'policy_lead_department';

-- ────────────  013b — departments + leads + scope columns ────────────

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments
  for select using (true);

drop policy if exists departments_write_admin on public.departments;
create policy departments_write_admin on public.departments
  for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.departments (name) values
  ('Volt Europa'),
  ('Volt EP'),
  ('Volt Nederland'),
  ('Volt Duitsland'),
  ('Volt Maastricht')
on conflict (name) do nothing;

create table if not exists public.department_leads (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (department_id, user_id)
);

alter table public.department_leads enable row level security;

drop policy if exists department_leads_read on public.department_leads;
create policy department_leads_read on public.department_leads
  for select using (true);

drop policy if exists department_leads_write_admin on public.department_leads;
create policy department_leads_write_admin on public.department_leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.documents
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists documents_department_id_idx
  on public.documents(department_id);

create or replace function public.is_department_lead_for_doc(d_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    join public.department_leads dl on dl.department_id = d.department_id
    join public.profiles p on p.id = dl.user_id
    where d.id = d_id
      and dl.user_id = auth.uid()
      and p.role = 'policy_lead_department'::public.user_role
  );
$$;

-- Grant to PUBLIC (every connected role) so the function works
-- regardless of which connection role is in use. SECURITY DEFINER
-- means the body runs with the function owner's rights regardless.
grant execute on function public.is_department_lead_for_doc(uuid) to public;

create table if not exists public.user_group_leads (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.user_group_leads enable row level security;

drop policy if exists user_group_leads_read on public.user_group_leads;
create policy user_group_leads_read on public.user_group_leads
  for select using (true);

drop policy if exists user_group_leads_write_admin on public.user_group_leads;
create policy user_group_leads_write_admin on public.user_group_leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

alter table public.profiles
  add column if not exists primary_department_id uuid references public.departments(id) on delete set null;

create index if not exists profiles_primary_department_id_idx
  on public.profiles(primary_department_id);

-- ────────────  014 — retire member + translator  ────────────

update public.profiles
   set role = 'editor'::public.user_role
 where role in ('member'::public.user_role, 'translator'::public.user_role);

alter table public.profiles
  alter column role set default 'editor'::public.user_role;
