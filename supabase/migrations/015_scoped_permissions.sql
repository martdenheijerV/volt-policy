-- 015_scoped_permissions.sql
--
-- Scoped permissions overhaul. Implements the per-group / per-department
-- per-member permission model that replaces the doc_type × group matrix.
--
-- The model in one paragraph
-- --------------------------
-- Every document belongs to exactly ONE scope: a working group OR a
-- department (XOR — never both, never neither). Inside that scope the
-- *lead* has full powers (admin within the scope). Members inherit
-- can_read=true / can_edit=false by default; the lead can flip can_edit
-- per member, and per individual document via the existing
-- `document_permissions` table. Approval (`status = 'review'` →
-- `'approved'`) is restricted to admins and scope leads only — the
-- approve-action is also the publish-action because guardrail #3 makes
-- approved docs publicly readable at /library.
--
-- What this migration does, in order
-- ----------------------------------
-- 1. Adds `documents.group_id` (nullable FK to user_groups). With the
--    existing `documents.department_id`, the new XOR constraint enforces
--    "one scope per doc".
-- 2. Adds `user_group_member_permissions` and
--    `department_member_permissions` — per-member can_read / can_edit
--    inside a group / department.
-- 3. Adds `document_access_requests` — the request-access workflow,
--    surfaced in the UI as the "Toegang aanvragen" button on a doc that
--    the user can't edit, and the leads' inbox at /admin/requests.
-- 4. Backfills:
--    a. Every document with neither group nor department → assigned to
--       the seeded "Volt Europa" department (the algemene catchall).
--    b. Every existing user_group_members row → gets a matching
--       user_group_member_permissions row with can_read=true,
--       can_edit=false. Preserves current behaviour for existing groups.
-- 5. Adds the XOR check constraint on documents (after backfill).
-- 6. Rewrites `doc_visible`, `doc_editable`, `can_approve_doc` to read
--    from the new tables (and stop reading group_doc_permissions).
-- 7. Replaces the documents INSERT policy: the chosen scope must be one
--    the calling user can publish into (admin, scope lead, or
--    member-with-can_edit).
-- 8. Deprecates `user_group_can_read` / `user_group_can_edit` to no-op
--    stubs. The `group_doc_permissions` table is kept for archival
--    purposes (audit history) but no longer consulted by RLS.
--
-- Idempotent: every CREATE uses IF NOT EXISTS or CREATE OR REPLACE,
-- every DROP uses IF EXISTS.

begin;

-- ---------------------------------------------------------------
-- 1. documents.group_id
-- ---------------------------------------------------------------
alter table public.documents
  add column if not exists group_id uuid
    references public.user_groups(id) on delete set null;

create index if not exists documents_group_id_idx
  on public.documents(group_id);

-- ---------------------------------------------------------------
-- 2a. user_group_member_permissions
-- ---------------------------------------------------------------
-- Per-member rights inside a working group. A row says: user U, when
-- looking at a doc whose group_id = G, may read and/or edit. Default
-- on creation: can_read=true, can_edit=false (sensible "you joined
-- the group" baseline; lead promotes to edit explicitly).
--
-- granted_by is nullable on delete set null so a lead leaving the
-- group doesn't cascade-destroy its members' rights.
create table if not exists public.user_group_member_permissions (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_read boolean not null default true,
  can_edit boolean not null default false,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  primary key (group_id, user_id)
);

alter table public.user_group_member_permissions enable row level security;

-- Self-read: a user can always see their own row (so the UI can show
-- "you have edit rights here" without needing a separate API call).
drop policy if exists ugmp_self_read on public.user_group_member_permissions;
create policy ugmp_self_read on public.user_group_member_permissions
  for select using (user_id = public.current_user_id());

-- Lead/admin read: leads see all rows for their group; admins see all.
drop policy if exists ugmp_lead_read on public.user_group_member_permissions;
create policy ugmp_lead_read on public.user_group_member_permissions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.user_group_leads ugl
      where ugl.group_id = user_group_member_permissions.group_id
        and ugl.user_id = public.current_user_id()
    )
  );

-- Lead/admin write: only group leads (with the policy_lead role) and
-- admins can grant / revoke per-member rights. The role check on the
-- lead exists because user_group_leads is also written to during
-- onboarding before the role is set; only the role+leads combination
-- grants the powers.
drop policy if exists ugmp_lead_write on public.user_group_member_permissions;
create policy ugmp_lead_write on public.user_group_member_permissions
  for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_group_leads ugl
      join public.profiles p on p.id = ugl.user_id
      where ugl.group_id = user_group_member_permissions.group_id
        and ugl.user_id = public.current_user_id()
        and p.role = 'policy_lead'::public.user_role
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_group_leads ugl
      join public.profiles p on p.id = ugl.user_id
      where ugl.group_id = user_group_member_permissions.group_id
        and ugl.user_id = public.current_user_id()
        and p.role = 'policy_lead'::public.user_role
    )
  );

-- ---------------------------------------------------------------
-- 2b. department_member_permissions
-- ---------------------------------------------------------------
-- Same shape as ugmp, scoped to departments and gated by
-- department_leads with the policy_lead_department role.
create table if not exists public.department_member_permissions (
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_read boolean not null default true,
  can_edit boolean not null default false,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  primary key (department_id, user_id)
);

alter table public.department_member_permissions enable row level security;

drop policy if exists dmp_self_read on public.department_member_permissions;
create policy dmp_self_read on public.department_member_permissions
  for select using (user_id = public.current_user_id());

drop policy if exists dmp_lead_read on public.department_member_permissions;
create policy dmp_lead_read on public.department_member_permissions
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.department_leads dl
      where dl.department_id = department_member_permissions.department_id
        and dl.user_id = public.current_user_id()
    )
  );

drop policy if exists dmp_lead_write on public.department_member_permissions;
create policy dmp_lead_write on public.department_member_permissions
  for all
  using (
    public.is_admin()
    or exists (
      select 1 from public.department_leads dl
      join public.profiles p on p.id = dl.user_id
      where dl.department_id = department_member_permissions.department_id
        and dl.user_id = public.current_user_id()
        and p.role = 'policy_lead_department'::public.user_role
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.department_leads dl
      join public.profiles p on p.id = dl.user_id
      where dl.department_id = department_member_permissions.department_id
        and dl.user_id = public.current_user_id()
        and p.role = 'policy_lead_department'::public.user_role
    )
  );

-- ---------------------------------------------------------------
-- 3. Access-request workflow: reuse public.edit_rights_requests
-- ---------------------------------------------------------------
-- Migration 008 already established the request/approve table for
-- edit access (`edit_rights_requests`) plus its decision helper
-- `can_decide_edit_request(req_id)` and a trigger that materialises
-- the approved request into a document_permissions row. Section 6
-- of this migration rewrites `can_approve_doc`, which is what
-- `can_decide_edit_request` delegates to — so leads of the new
-- scopes automatically gain decision rights without touching that
-- table.
--
-- Why no separate read-access request workflow: a user who isn't
-- in the doc's group/department doesn't see the doc exists, so they
-- can't request anything. The UX is "share the URL → recipient sees
-- a forbidden page → asks the lead to add them as a member" — covered
-- by the leads' member management in /admin/groups/<id> and
-- /admin/departments/<id>.

-- ---------------------------------------------------------------
-- 4. Backfills
-- ---------------------------------------------------------------
-- 4a. Documents without any scope → Volt Europa department.
--
-- Volt Europa is the seeded catchall (migration 013). If for some
-- reason it isn't there (custom local seed), the update is a no-op
-- and we add a CHECK constraint immediately after; the apply will
-- fail loudly so the operator knows to seed it.
update public.documents
   set department_id = (
     select id from public.departments where name = 'Volt Europa' limit 1
   )
 where group_id is null
   and department_id is null;

-- 4b. Existing group memberships → default per-member permissions.
--
-- ON CONFLICT DO NOTHING: re-running the migration after some leads
-- have already adjusted permissions doesn't clobber their work.
insert into public.user_group_member_permissions (group_id, user_id, can_read, can_edit)
select group_id, user_id, true, false
  from public.user_group_members
on conflict (group_id, user_id) do nothing;

-- ---------------------------------------------------------------
-- 5. XOR check on documents
-- ---------------------------------------------------------------
-- Exactly one of (group_id, department_id) must be non-null. We add
-- the constraint NOT VALID first to avoid a long table scan on prod
-- and rely on the backfill above to have left no offenders. Then
-- VALIDATE — that does scan, but cheaply on a fresh table.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_scope_xor_chk'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_scope_xor_chk
      check (
        (group_id is not null and department_id is null)
        or (group_id is null and department_id is not null)
      ) not valid;
    alter table public.documents validate constraint documents_scope_xor_chk;
  end if;
end $$;

-- ---------------------------------------------------------------
-- 6. Rewrite the SECURITY DEFINER helpers
-- ---------------------------------------------------------------

-- 6a. doc_visible
--
-- Order of branches matches the user-facing rules:
--   public approved → admin → owner → per-doc explicit grant →
--   group lead → dept lead → group member can_read → dept member can_read.
-- Every branch is a single EXISTS, so this stays cheap as the join
-- targets are all (group_id, user_id) / (department_id, user_id) PKs.
create or replace function public.doc_visible(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc
      and (
        d.status = 'approved'
        or public.is_admin()
        or d.owner_id = public.current_user_id()
        or exists (
          select 1 from public.document_permissions dp
          where dp.document_id = d.id
            and dp.user_id = public.current_user_id()
        )
        or (d.group_id is not null and exists (
          select 1 from public.user_group_leads ugl
          join public.profiles pr on pr.id = ugl.user_id
          where ugl.group_id = d.group_id
            and ugl.user_id = public.current_user_id()
            and pr.role = 'policy_lead'::public.user_role
        ))
        or (d.department_id is not null and exists (
          select 1 from public.department_leads dl
          join public.profiles pr on pr.id = dl.user_id
          where dl.department_id = d.department_id
            and dl.user_id = public.current_user_id()
            and pr.role = 'policy_lead_department'::public.user_role
        ))
        -- Group / dept member with can_read OR can_edit. We accept
        -- either flag because can_edit semantically implies can_read,
        -- and we'd rather a defensive OR than rely on a constraint
        -- the table doesn't (yet) enforce.
        or (d.group_id is not null and exists (
          select 1 from public.user_group_member_permissions ugmp
          where ugmp.group_id = d.group_id
            and ugmp.user_id = public.current_user_id()
            and (ugmp.can_read or ugmp.can_edit)
        ))
        or (d.department_id is not null and exists (
          select 1 from public.department_member_permissions dmp
          where dmp.department_id = d.department_id
            and dmp.user_id = public.current_user_id()
            and (dmp.can_read or dmp.can_edit)
        ))
      )
  );
$$;

-- 6b. can_approve_doc
--
-- Approve = admin OR scope lead. Editing during review state is also
-- gated on this (see doc_editable below) — the doc is locked to
-- everyone except the people who can move it forward, the same
-- principle as migration 007 (approved means locked & public).
create or replace function public.can_approve_doc(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc
      and (
        public.is_admin()
        or (d.group_id is not null and exists (
          select 1 from public.user_group_leads ugl
          join public.profiles pr on pr.id = ugl.user_id
          where ugl.group_id = d.group_id
            and ugl.user_id = public.current_user_id()
            and pr.role = 'policy_lead'::public.user_role
        ))
        or (d.department_id is not null and exists (
          select 1 from public.department_leads dl
          join public.profiles pr on pr.id = dl.user_id
          where dl.department_id = d.department_id
            and dl.user_id = public.current_user_id()
            and pr.role = 'policy_lead_department'::public.user_role
        ))
      )
  );
$$;

-- 6c. doc_editable
--
-- Status-aware:
--   approved  → admin only (preserves migration 007's "approved is
--                publicly locked" invariant; admins can correct typos
--                via a documented re-approval flow)
--   archived  → admin only
--   review    → only approvers (admin + scope leads); rest of group
--                is locked out so the review version is a stable
--                target for comments
--   draft     → admin / owner / scope lead / per-doc can_edit /
--                group member can_edit / dept member can_edit
create or replace function public.doc_editable(p_doc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with d as (select * from public.documents where id = p_doc)
  select case
    when (select status from d) = 'approved' then public.is_admin()
    when (select status from d) = 'archived' then public.is_admin()
    when (select status from d) = 'review'   then public.can_approve_doc(p_doc)
    else (
      public.is_admin()
      or (select owner_id from d) = public.current_user_id()
      or ((select group_id from d) is not null and exists (
        select 1 from public.user_group_leads ugl
        join public.profiles pr on pr.id = ugl.user_id
        where ugl.group_id = (select group_id from d)
          and ugl.user_id = public.current_user_id()
          and pr.role = 'policy_lead'::public.user_role
      ))
      or ((select department_id from d) is not null and exists (
        select 1 from public.department_leads dl
        join public.profiles pr on pr.id = dl.user_id
        where dl.department_id = (select department_id from d)
          and dl.user_id = public.current_user_id()
          and pr.role = 'policy_lead_department'::public.user_role
      ))
      or exists (
        select 1 from public.document_permissions dp
        where dp.document_id = p_doc
          and dp.user_id = public.current_user_id()
          and dp.can_edit
      )
      or ((select group_id from d) is not null and exists (
        select 1 from public.user_group_member_permissions ugmp
        where ugmp.group_id = (select group_id from d)
          and ugmp.user_id = public.current_user_id()
          and ugmp.can_edit
      ))
      or ((select department_id from d) is not null and exists (
        select 1 from public.department_member_permissions dmp
        where dmp.department_id = (select department_id from d)
          and dmp.user_id = public.current_user_id()
          and dmp.can_edit
      ))
    )
  end;
$$;

-- 6d. can_publish_to_group / can_publish_to_department
--
-- Used by the documents INSERT policy below and by the server action
-- that lists eligible scopes in the new-document form.
create or replace function public.can_publish_to_group(g_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select g_id is not null and (
    public.is_admin()
    or exists (
      select 1 from public.user_group_leads ugl
      join public.profiles pr on pr.id = ugl.user_id
      where ugl.group_id = g_id
        and ugl.user_id = public.current_user_id()
        and pr.role = 'policy_lead'::public.user_role
    )
    or exists (
      select 1 from public.user_group_member_permissions ugmp
      where ugmp.group_id = g_id
        and ugmp.user_id = public.current_user_id()
        and ugmp.can_edit
    )
  );
$$;

create or replace function public.can_publish_to_department(d_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select d_id is not null and (
    public.is_admin()
    or exists (
      select 1 from public.department_leads dl
      join public.profiles pr on pr.id = dl.user_id
      where dl.department_id = d_id
        and dl.user_id = public.current_user_id()
        and pr.role = 'policy_lead_department'::public.user_role
    )
    or exists (
      select 1 from public.department_member_permissions dmp
      where dmp.department_id = d_id
        and dmp.user_id = public.current_user_id()
        and dmp.can_edit
    )
  );
$$;

grant execute on function public.can_publish_to_group(uuid) to anon, authenticated;
grant execute on function public.can_publish_to_department(uuid) to anon, authenticated;

-- ---------------------------------------------------------------
-- 7. Replace documents INSERT policy
-- ---------------------------------------------------------------
-- Old policy: any editor+admin can insert as long as owner_id = self.
-- New policy: same, plus the chosen scope must be one the user is
-- entitled to publish into. The XOR check above guarantees exactly
-- one of (group_id, department_id) is set on every new row, so the
-- OR below is exclusive in practice.
drop policy if exists "documents_insert_member_or_up" on public.documents;
drop policy if exists "documents_insert_scoped" on public.documents;
create policy documents_insert_scoped on public.documents
  for insert with check (
    public.current_user_id() is not null
    and owner_id = public.current_user_id()
    and (
      public.can_publish_to_group(group_id)
      or public.can_publish_to_department(department_id)
    )
  );

-- ---------------------------------------------------------------
-- 8. Deprecate the old matrix helpers
-- ---------------------------------------------------------------
-- Replaced with no-op stubs so any leftover SQL that calls them
-- compiles but always returns false. Safe-by-default: if some old
-- code path still expects matrix-derived permissions, it now
-- silently returns "no", surfacing the gap as a UI bug instead of a
-- security hole.
create or replace function public.user_group_can_read(d_type public.doc_type, d_status public.doc_status)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$ select false $$;

create or replace function public.user_group_can_edit(d_type public.doc_type, d_status public.doc_status)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$ select false $$;

comment on function public.user_group_can_read(public.doc_type, public.doc_status)
  is 'DEPRECATED in 015_scoped_permissions. Per-member permissions live in user_group_member_permissions / department_member_permissions. This stub returns false so old callers fail closed.';
comment on function public.user_group_can_edit(public.doc_type, public.doc_status)
  is 'DEPRECATED in 015_scoped_permissions. See user_group_can_read comment.';

-- ---------------------------------------------------------------
-- 9. Audit-log lifecycle hooks (best-effort)
-- ---------------------------------------------------------------
-- Guardrail #6 says privileged actions write to audit_log. We don't
-- automate that here because the audit_log table's exact shape isn't
-- pinned down yet (per CLAUDE.md the section is a placeholder).
-- Server actions that flip can_edit / approve / publish are the
-- right place to insert audit rows once the schema lands.

commit;

-- ---------------------------------------------------------------
-- Done.
-- ---------------------------------------------------------------
