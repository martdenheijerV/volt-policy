-- 005_eu_pure_auth.sql
--
-- EU-pure auth migration. Removes the dependency on Supabase Cloud's
-- `auth.users` table and the auth.uid() / auth.role() helpers. After this
-- migration, identity comes from an external OIDC provider (Volt Auth /
-- Authentik) and is upserted into `public.profiles` keyed by `oidc_sub`.
--
-- Per-request user context is established by the application via:
--   set local app.user_id = '<profile-uuid>';
--   set local app.role    = 'authenticated' | 'anon';
-- (see lib/db/sql.ts -> withUser()).
--
-- This file is idempotent: it can be re-run safely.

begin;

-- ---------------------------------------------------------------------------
-- 1. Add oidc_sub on profiles. This becomes the stable identity from the
--    external OIDC provider; profiles.id stays the internal primary key.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists oidc_sub text;

create unique index if not exists profiles_oidc_sub_key
  on public.profiles (oidc_sub)
  where oidc_sub is not null;

alter table public.profiles
  alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------------
-- 2. Drop the trigger that auto-created profiles from auth.users inserts.
--    The new OIDC callback upserts profiles directly. Wrapped in a DO
--    block so it doesn't fail when the auth schema is absent.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
  end if;
end $$;

drop function if exists public.handle_new_user() cascade;

-- ---------------------------------------------------------------------------
-- 3. Replace auth.uid() / auth.role() with current_setting()-based helpers.
--    These run as SECURITY DEFINER so RLS policies that call them from a
--    SECURITY INVOKER context (the default) still see the right value.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function public.current_user_role_setting()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'anon');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = public.current_user_id()),
    false
  );
$$;

create or replace function public.is_editor_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('admin','editor') from public.profiles where id = public.current_user_id()),
    false
  );
$$;

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = public.current_user_id();
$$;

-- ---------------------------------------------------------------------------
-- 4. Per-document permission helpers. Wraps the existing can_edit/can_comment
--    booleans on document_permissions. SECURITY DEFINER to break recursion.
--
--    We drop the old definitions first because Postgres won't let us rename
--    parameters via `create or replace function`.
-- ---------------------------------------------------------------------------

drop function if exists public.user_owns_doc(uuid) cascade;
drop function if exists public.user_has_doc_permission(uuid, boolean) cascade;
drop function if exists public.user_has_doc_permission(uuid, text) cascade;
drop function if exists public.user_group_can_read(public.doc_type, public.doc_status) cascade;
drop function if exists public.user_group_can_edit(public.doc_type, public.doc_status) cascade;
drop function if exists public.doc_visible(uuid) cascade;
drop function if exists public.doc_editable(uuid) cascade;

create or replace function public.user_owns_doc(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc and d.owner_id = public.current_user_id()
  );
$$;

-- New 2-arg variant: matches 003 signature (uuid, boolean).
create or replace function public.user_has_doc_permission(p_doc uuid, p_edit boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.document_permissions dp
    where dp.document_id = p_doc
      and dp.user_id = public.current_user_id()
      and (not p_edit or dp.can_edit)
  );
$$;

-- Group permission helpers — match the actual group_doc_permissions schema
-- (document_type, status, can_read, can_edit) from migration 004.

create or replace function public.user_group_can_read(d_type public.doc_type, d_status public.doc_status)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_group_members m
    join public.group_doc_permissions p on p.group_id = m.group_id
    where m.user_id = public.current_user_id()
      and p.can_read
      and (p.document_type is null or p.document_type = d_type)
      and (p.status is null or p.status = d_status)
  );
$$;

create or replace function public.user_group_can_edit(d_type public.doc_type, d_status public.doc_status)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_group_members m
    join public.group_doc_permissions p on p.group_id = m.group_id
    where m.user_id = public.current_user_id()
      and p.can_edit
      and (p.document_type is null or p.document_type = d_type)
      and (p.status is null or p.status = d_status)
  );
$$;

create or replace function public.doc_visible(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_doc
      and (
        d.status = 'approved'
        or (public.current_user_id() is not null and d.status in ('review','approved'))
        or public.is_editor_or_admin()
        or d.owner_id = public.current_user_id()
        or exists (
          select 1 from public.document_permissions dp
          where dp.document_id = d.id and dp.user_id = public.current_user_id()
        )
        or public.user_group_can_read(d.document_type, d.status)
      )
  );
$$;

create or replace function public.doc_editable(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor_or_admin()
      or exists (select 1 from public.documents d where d.id = p_doc and d.owner_id = public.current_user_id())
      or exists (select 1 from public.document_permissions dp
                 where dp.document_id = p_doc and dp.user_id = public.current_user_id() and dp.can_edit)
      or exists (select 1 from public.documents d
                 where d.id = p_doc
                   and public.user_group_can_edit(d.document_type, d.status));
$$;

-- ---------------------------------------------------------------------------
-- 5. Drop *all* existing RLS policies on the affected tables and recreate
--    them on top of the new helpers. Wrapped in DO blocks for idempotency.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  p text;
begin
  for t, p in
    select schemaname || '.' || tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'documents', 'document_versions', 'comments',
        'document_permissions', 'document_translations',
        'amendments', 'amendment_supporters',
        'metadata_fields', 'document_metadata_values',
        'citations', 'document_discussions',
        'audit_log', 'document_embeddings',
        'user_groups', 'user_group_members', 'group_doc_permissions'
      )
  loop
    execute format('drop policy if exists %I on %s', p, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------

create policy "profiles_self_select" on public.profiles
  for select using (public.current_user_id() = id);
create policy "profiles_self_update" on public.profiles
  for update using (public.current_user_id() = id);
create policy "profiles_authenticated_read_names" on public.profiles
  for select using (public.current_user_role_setting() = 'authenticated');
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- DOCUMENTS
-- ---------------------------------------------------------------------------

create policy "documents_public_read_approved" on public.documents
  for select using (status = 'approved');

create policy "documents_visible" on public.documents
  for select using (public.doc_visible(id));

create policy "documents_editable" on public.documents
  for update using (public.doc_editable(id));

create policy "documents_insert_member_or_up" on public.documents
  for insert with check (
    public.current_user_id() is not null
    and public.is_editor_or_admin()
    and owner_id = public.current_user_id()
  );

create policy "documents_delete_admin_or_owner" on public.documents
  for delete using (
    public.is_admin()
    or owner_id = public.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- DOCUMENT VERSIONS
-- ---------------------------------------------------------------------------

create policy "document_versions_visible" on public.document_versions
  for select using (public.doc_visible(document_id));
create policy "document_versions_insert" on public.document_versions
  for insert with check (public.doc_editable(document_id));

-- ---------------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------------

create policy "comments_visible" on public.comments
  for select using (public.doc_visible(document_id));
create policy "comments_insert" on public.comments
  for insert with check (
    public.doc_visible(document_id)
    and public.current_user_id() is not null
    and author_id = public.current_user_id()
  );
create policy "comments_update_own" on public.comments
  for update using (author_id = public.current_user_id() or public.is_admin());
create policy "comments_delete_own_or_admin" on public.comments
  for delete using (author_id = public.current_user_id() or public.is_admin());

-- ---------------------------------------------------------------------------
-- DOCUMENT PERMISSIONS
-- ---------------------------------------------------------------------------

create policy "document_permissions_visible" on public.document_permissions
  for select using (public.doc_visible(document_id));
create policy "document_permissions_admin_or_owner" on public.document_permissions
  for all using (public.is_admin() or public.user_owns_doc(document_id))
  with check (public.is_admin() or public.user_owns_doc(document_id));

-- ---------------------------------------------------------------------------
-- TRANSLATIONS — public if verified
-- ---------------------------------------------------------------------------

create policy "trans_public_read_verified" on public.document_translations
  for select using (status = 'verified');
create policy "trans_visible" on public.document_translations
  for select using (public.doc_visible(document_id));
create policy "trans_insert" on public.document_translations
  for insert with check (
    public.is_editor_or_admin()
    or public.current_user_id() in (select id from public.profiles where role = 'translator')
  );
create policy "trans_update" on public.document_translations
  for update using (
    public.is_editor_or_admin() or translator_id = public.current_user_id()
  );

-- ---------------------------------------------------------------------------
-- AMENDMENTS
-- ---------------------------------------------------------------------------

create policy "amend_visible" on public.amendments
  for select using (public.doc_visible(document_id));
create policy "amend_insert" on public.amendments
  for insert with check (
    public.current_user_id() is not null and proposer_id = public.current_user_id()
  );
create policy "amend_update_self" on public.amendments
  for update using (proposer_id = public.current_user_id() and status = 'proposed');
create policy "amend_admin_decide" on public.amendments
  for update using (public.is_admin() or public.user_owns_doc(document_id));
create policy "amend_delete" on public.amendments
  for delete using (public.is_admin() or proposer_id = public.current_user_id());

create policy "amend_sup_read" on public.amendment_supporters
  for select using (public.current_user_role_setting() = 'authenticated');
create policy "amend_sup_self" on public.amendment_supporters
  for all using (user_id = public.current_user_id());

-- ---------------------------------------------------------------------------
-- METADATA, CITATIONS, DISCUSSIONS
-- ---------------------------------------------------------------------------

create policy "meta_fields_read" on public.metadata_fields
  for select using (true);
create policy "meta_fields_admin" on public.metadata_fields
  for all using (public.is_admin());

create policy "meta_values_read" on public.document_metadata_values
  for select using (public.doc_visible(document_id));
create policy "meta_values_write" on public.document_metadata_values
  for all using (public.doc_editable(document_id));

create policy "cite_read" on public.citations
  for select using (public.doc_visible(document_id));
create policy "cite_write" on public.citations
  for all using (public.doc_editable(document_id));

create policy "disc_read" on public.document_discussions
  for select using (public.doc_visible(document_id));
create policy "disc_write" on public.document_discussions
  for all using (public.doc_editable(document_id));

-- ---------------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------------

create policy "audit_admin_read" on public.audit_log
  for select using (public.is_admin());
create policy "audit_authenticated_insert" on public.audit_log
  for insert with check (public.current_user_id() is not null);

-- ---------------------------------------------------------------------------
-- EMBEDDINGS
-- ---------------------------------------------------------------------------

create policy "embed_read" on public.document_embeddings
  for select using (public.current_user_role_setting() = 'authenticated');
create policy "embed_admin_write" on public.document_embeddings
  for all using (public.is_editor_or_admin());

-- ---------------------------------------------------------------------------
-- USER GROUPS + MEMBERSHIPS + GROUP DOC PERMISSIONS
-- ---------------------------------------------------------------------------

create policy "groups_read" on public.user_groups
  for select using (public.current_user_role_setting() = 'authenticated');
create policy "groups_admin_all" on public.user_groups
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "group_members_self_or_admin" on public.user_group_members
  for select using (
    user_id = public.current_user_id() or public.is_admin()
  );
create policy "group_members_admin_all" on public.user_group_members
  for all using (public.is_admin())
  with check (public.is_admin());

create policy "group_perms_read" on public.group_doc_permissions
  for select using (public.current_user_role_setting() = 'authenticated');
create policy "group_perms_admin_all" on public.group_doc_permissions
  for all using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. FK cleanup. The previous schema had `profiles.id references auth.users
--    on delete cascade`. With auth.users gone, profile deletion is the
--    source of truth. Drop the FK if present.
-- ---------------------------------------------------------------------------

do $$
declare
  fk_name text;
begin
  select c.conname into fk_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'f'
    and pg_get_constraintdef(c.oid) ilike '%auth.users%';

  if fk_name is not null then
    execute format('alter table public.profiles drop constraint %I', fk_name);
  end if;
end $$;

commit;
