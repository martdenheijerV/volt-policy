-- 001_init_policy_schema.sql
--
-- Initial schema: enums, profiles, documents, versions, comments,
-- per-document permissions, updated_at triggers, and RLS policies.

-- =========================
-- ENUMS
-- =========================
create type public.user_role as enum ('admin', 'editor', 'member', 'translator');
create type public.doc_status as enum ('draft', 'review', 'approved', 'archived');
create type public.doc_type as enum ('policy', 'position', 'resolution', 'statement', 'motion', 'other');

-- =========================
-- PROFILES
-- =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role public.user_role not null default 'member',
  language_pref text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile when auth user is inserted
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: get current user's role (security definer to avoid RLS recursion)
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_editor_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin','editor') from public.profiles where id = auth.uid()), false);
$$;

-- =========================
-- DOCUMENTS
-- =========================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  status public.doc_status not null default 'draft',
  document_type public.doc_type not null default 'policy',
  language text not null default 'en',
  purpose text,
  tags text[] not null default '{}',
  owner_id uuid references public.profiles(id) on delete set null,
  current_content text not null default '',
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(purpose, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(current_content, '')), 'C')
  ) stored
);

create index documents_search_idx on public.documents using gin(search_tsv);
create index documents_status_idx on public.documents(status);
create index documents_owner_idx on public.documents(owner_id);
create index documents_tags_idx on public.documents using gin(tags);

-- =========================
-- DOCUMENT VERSIONS
-- =========================
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int not null,
  title text not null,
  content text not null,
  change_summary text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index document_versions_doc_idx on public.document_versions(document_id, version_number desc);

-- =========================
-- COMMENTS
-- =========================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number int,
  author_id uuid references public.profiles(id) on delete set null,
  author_name_cached text, -- for GDPR: preserved after user deletion
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null,
  anchor_quote text, -- selected text the comment refers to
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_doc_idx on public.comments(document_id);

-- =========================
-- DOCUMENT PERMISSIONS (optional per-doc overrides)
-- =========================
create table public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  can_edit boolean not null default false,
  can_comment boolean not null default true,
  granted_at timestamptz not null default now(),
  unique (document_id, user_id)
);

create index document_permissions_doc_idx on public.document_permissions(document_id);

-- =========================
-- updated_at triggers
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- =========================
-- RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.comments enable row level security;
alter table public.document_permissions enable row level security;

-- PROFILES policies
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_admin_select_all" on public.profiles
  for select using (public.is_admin());
create policy "profiles_authenticated_read_names" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- DOCUMENTS policies
create policy "documents_public_read_approved" on public.documents
  for select using (status = 'approved');

create policy "documents_member_read_visible" on public.documents
  for select using (
    auth.uid() is not null and status in ('review','approved')
  );
create policy "documents_editor_read_all" on public.documents
  for select using (public.is_editor_or_admin());
create policy "documents_owner_read_own" on public.documents
  for select using (auth.uid() = owner_id);
create policy "documents_explicit_permission_read" on public.documents
  for select using (
    exists (
      select 1 from public.document_permissions p
      where p.document_id = documents.id and p.user_id = auth.uid()
    )
  );

create policy "documents_editor_insert" on public.documents
  for insert with check (public.is_editor_or_admin() and auth.uid() = owner_id);

create policy "documents_update" on public.documents
  for update using (
    public.is_admin()
    or auth.uid() = owner_id
    or exists (
      select 1 from public.document_permissions p
      where p.document_id = documents.id and p.user_id = auth.uid() and p.can_edit
    )
  );

create policy "documents_delete" on public.documents
  for delete using (public.is_admin() or auth.uid() = owner_id);

-- DOCUMENT VERSIONS policies
create policy "versions_read" on public.document_versions
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = document_versions.document_id
      and (
        d.status = 'approved'
        or (auth.uid() is not null and d.status in ('review','approved'))
        or public.is_editor_or_admin()
        or d.owner_id = auth.uid()
        or exists (select 1 from public.document_permissions p where p.document_id = d.id and p.user_id = auth.uid())
      )
    )
  );

create policy "versions_insert" on public.document_versions
  for insert with check (
    public.is_editor_or_admin()
    or exists (
      select 1 from public.documents d
      where d.id = document_id and (d.owner_id = auth.uid()
        or exists (select 1 from public.document_permissions p where p.document_id = d.id and p.user_id = auth.uid() and p.can_edit))
    )
  );

-- COMMENTS policies
create policy "comments_read" on public.comments
  for select using (
    exists (
      select 1 from public.documents d
      where d.id = comments.document_id
      and (
        d.status = 'approved'
        or (auth.uid() is not null and d.status in ('review','approved'))
        or public.is_editor_or_admin()
        or d.owner_id = auth.uid()
      )
    )
  );

create policy "comments_insert" on public.comments
  for insert with check (
    auth.uid() is not null and auth.uid() = author_id
  );

create policy "comments_update_own" on public.comments
  for update using (auth.uid() = author_id or public.is_admin());

create policy "comments_delete" on public.comments
  for delete using (auth.uid() = author_id or public.is_admin());

-- DOCUMENT PERMISSIONS policies (admins only)
create policy "perms_admin_all" on public.document_permissions
  for all using (public.is_admin());
create policy "perms_owner_manage" on public.document_permissions
  for all using (
    exists (select 1 from public.documents d where d.id = document_id and d.owner_id = auth.uid())
  );
