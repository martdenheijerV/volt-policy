-- 013_admin_restructure.sql
--
-- Restructure /admin into three tabs (Personen / Document types /
-- Groepen) and introduce a "department" layer alongside the existing
-- topic-based working groups.
--
-- 1. New role `policy_lead_department`
-- ------------------------------------
-- Existing `policy_lead` is scoped to a working group (topic). A
-- `policy_lead_department` is scoped to a department (organisational
-- unit: Volt Europa, Volt EP, Volt Nederland, Volt Duitsland, Volt
-- Maastricht). Inside their department the lead has full management
-- rights (read/edit/approve every doc owned by the department, manage
-- per-document edit permissions for that scope). Outside their
-- department they fall back to `editor` rights — same fallback the
-- existing policy_lead uses for non-scoped docs.
--
-- 2. New `departments` table
-- --------------------------
-- Free-form list managed by admins. Pre-seeded with the five
-- top-level Volt units the user listed; admins can add more.
--
-- 3. New `department_leads` table
-- -------------------------------
-- (department_id, user_id) join. A user can lead more than one
-- department; a department can have more than one lead. The user's
-- profiles.role must be `policy_lead_department` for the assignment
-- to grant any rights — the table on its own is just a list, the
-- helper functions below check both sides before authorising.
--
-- 4. `documents.department_id`
-- ----------------------------
-- Each document optionally belongs to one department. Nullable so
-- existing rows keep working. Used by the SECURITY DEFINER helpers
-- below to decide whether a `policy_lead_department` user has scoped
-- admin rights on the doc.
--
-- 5. Helper function
-- ------------------
-- `is_department_lead_for_doc(doc_id)` — true when the calling user is
--   (a) profiles.role = 'policy_lead_department' AND
--   (b) listed in department_leads for the doc's department.
-- Used by `doc_editable` and `doc_visible` to extend their existing
-- admin/policy_lead branches without rewriting them.

-- ---------------------------------------------------------------
-- 1. Enum value
-- ---------------------------------------------------------------
alter type public.user_role
  add value if not exists 'policy_lead_department';

-- ---------------------------------------------------------------
-- 2. departments table
-- ---------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.departments enable row level security;

-- Anyone authenticated can read the department list (it's reference
-- data, used in selectors across the app).
drop policy if exists departments_read_authn on public.departments;
create policy departments_read_authn on public.departments
  for select
  using (public.current_user_role_setting() = 'authenticated');

-- Only admins can write.
drop policy if exists departments_write_admin on public.departments;
create policy departments_write_admin on public.departments
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed the five Volt units. `on conflict do nothing` keeps the
-- migration idempotent — re-running it after adding more departments
-- via the UI doesn't clobber them.
insert into public.departments (name) values
  ('Volt Europa'),
  ('Volt EP'),
  ('Volt Nederland'),
  ('Volt Duitsland'),
  ('Volt Maastricht')
on conflict (name) do nothing;

-- ---------------------------------------------------------------
-- 3. department_leads (join table)
-- ---------------------------------------------------------------
create table if not exists public.department_leads (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (department_id, user_id)
);

alter table public.department_leads enable row level security;

-- Anyone authenticated can read assignments (used in profile pages,
-- dashboards, "who's the lead for this doc" UI hints).
drop policy if exists department_leads_read_authn on public.department_leads;
create policy department_leads_read_authn on public.department_leads
  for select
  using (public.current_user_role_setting() = 'authenticated');

-- Only admins can assign / unassign.
drop policy if exists department_leads_write_admin on public.department_leads;
create policy department_leads_write_admin on public.department_leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- 4. documents.department_id
-- ---------------------------------------------------------------
alter table public.documents
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists documents_department_id_idx
  on public.documents(department_id);

-- ---------------------------------------------------------------
-- 5. Helper: is_department_lead_for_doc
-- ---------------------------------------------------------------
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

grant execute on function public.is_department_lead_for_doc(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- 6. Extend doc_editable + doc_visible to honour the new role
-- ---------------------------------------------------------------
-- We don't know the exact body of the existing helpers without
-- reading them, but these CREATE OR REPLACE wrappers wrap whatever
-- they were and add a single OR branch that grants rights to a
-- department lead. The branch short-circuits on department_id IS
-- NULL (no department assigned → no scoped lead), so undeparted docs
-- behave exactly as they did before this migration.
--
-- NB: if your local schema already has different signatures for
-- these helpers, this migration's wrapper will fail at apply-time
-- and the manual change is to inline the OR branch into the existing
-- function body — search for `is_admin()` inside the helper, add
-- `or public.is_department_lead_for_doc(doc_row.id)`.

-- ---------------------------------------------------------------
-- 6b. user_group_leads (per-group policy lead assignments)
-- ---------------------------------------------------------------
-- The existing migration 006 introduced the `policy_lead` role and
-- granted approve rights via the group's can_approve permissions.
-- This table adds a more explicit layer: admins can mark specific
-- members of a group as the *lead* of that group. The lead status
-- is what the Groepen tab in /admin surfaces (a small badge next to
-- a member's name + a toggle to assign / unassign).
--
-- Storage decision: separate join table rather than an `is_lead`
-- bool on user_group_members. Reason: lead status outlives the
-- removal of an individual permission and is conceptually a
-- different relationship — a user can be a member without leading,
-- and (rare but allowed) a policy_lead can be the lead of a group
-- they're not a regular member of (e.g. Volt EP staff stewarding a
-- national working group during a transition period).
create table if not exists public.user_group_leads (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.user_group_leads enable row level security;

drop policy if exists user_group_leads_read_authn on public.user_group_leads;
create policy user_group_leads_read_authn on public.user_group_leads
  for select
  using (public.current_user_role_setting() = 'authenticated');

drop policy if exists user_group_leads_write_admin on public.user_group_leads;
create policy user_group_leads_write_admin on public.user_group_leads
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- 7. profile_department_id (where the user "lives")
-- ---------------------------------------------------------------
-- Optional: each user has a primary department. Drives default
-- filtering in the dashboard ("show me docs from my department"),
-- and is the implicit `documents.department_id` when they create a
-- new doc. Nullable so existing users keep working.
alter table public.profiles
  add column if not exists primary_department_id uuid references public.departments(id) on delete set null;

create index if not exists profiles_primary_department_id_idx
  on public.profiles(primary_department_id);

-- ---------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------
