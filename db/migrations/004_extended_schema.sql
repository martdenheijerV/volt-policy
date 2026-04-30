-- 004_extended_schema.sql
--
-- Adds the larger feature surface: groups, amendments, translations,
-- custom metadata, citations, discussion-platform routing, audit log,
-- AI embeddings, comment kinds. Updates doc_visible / doc_editable
-- to consult group permissions.

-- pgvector for AI similarity (used later)
create extension if not exists vector;

-- =========================
-- USER GROUPS + PERMISSIONS
-- =========================
create table public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.user_group_members (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.group_doc_permissions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.user_groups(id) on delete cascade,
  document_type public.doc_type,
  status public.doc_status,
  can_read boolean not null default true,
  can_edit boolean not null default false,
  can_comment boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.user_group_can_read(d_type public.doc_type, d_status public.doc_status)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_group_members m
    join public.group_doc_permissions p on p.group_id = m.group_id
    where m.user_id = auth.uid()
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
    where m.user_id = auth.uid()
      and p.can_edit
      and (p.document_type is null or p.document_type = d_type)
      and (p.status is null or p.status = d_status)
  );
$$;

-- =========================
-- AMENDMENTS
-- =========================
create type public.amendment_status as enum ('proposed', 'accepted', 'rejected', 'withdrawn');

create table public.amendments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  proposer_id uuid references public.profiles(id) on delete set null,
  proposer_name_cached text,
  target_quote text not null,
  replacement_text text not null,
  rationale text,
  status public.amendment_status not null default 'proposed',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index amendments_doc_idx on public.amendments(document_id);

create table public.amendment_supporters (
  amendment_id uuid not null references public.amendments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (amendment_id, user_id)
);

-- =========================
-- TRANSLATIONS
-- =========================
create type public.translation_status as enum ('machine', 'in_review', 'verified');

create table public.document_translations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  language text not null,
  source_version int not null,
  title text not null,
  content text not null,
  status public.translation_status not null default 'machine',
  translator_id uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, language)
);

create index translations_doc_idx on public.document_translations(document_id);

-- =========================
-- CUSTOM METADATA FIELDS
-- =========================
create type public.metadata_field_type as enum ('text', 'number', 'date', 'select', 'boolean');

create table public.metadata_fields (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  field_type public.metadata_field_type not null default 'text',
  options jsonb,
  required boolean not null default false,
  applies_to public.doc_type,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.document_metadata_values (
  document_id uuid not null references public.documents(id) on delete cascade,
  field_id uuid not null references public.metadata_fields(id) on delete cascade,
  value text,
  primary key (document_id, field_id)
);

-- =========================
-- CITATIONS
-- =========================
create table public.citations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  cite_key text not null,
  author text,
  year text,
  title text not null,
  source text,
  url text,
  zotero_key text,
  created_at timestamptz not null default now(),
  unique (document_id, cite_key)
);

create index citations_doc_idx on public.citations(document_id);

-- =========================
-- DISCUSSION LINKS
-- =========================
create table public.document_discussions (
  document_id uuid primary key references public.documents(id) on delete cascade,
  platform text,
  url text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =========================
-- AUDIT LOG
-- =========================
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name_cached text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_actor_idx on public.audit_log(actor_id, created_at desc);
create index audit_entity_idx on public.audit_log(entity_type, entity_id, created_at desc);

-- =========================
-- DOCUMENT EXTRA COLUMNS
-- =========================
alter table public.documents
  add column if not exists hidden_versions int[] not null default '{}',
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- =========================
-- COMMENT TYPE (review vs general)
-- =========================
do $$ begin
  create type public.comment_kind as enum ('general', 'review', 'suggestion');
exception when duplicate_object then null; end $$;

alter table public.comments
  add column if not exists kind public.comment_kind not null default 'general';

-- =========================
-- EMBEDDINGS for AI similarity
-- =========================
create table public.document_embeddings (
  document_id uuid primary key references public.documents(id) on delete cascade,
  version_number int not null,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

-- =========================
-- RLS for new tables
-- =========================
alter table public.user_groups enable row level security;
alter table public.user_group_members enable row level security;
alter table public.group_doc_permissions enable row level security;
alter table public.amendments enable row level security;
alter table public.amendment_supporters enable row level security;
alter table public.document_translations enable row level security;
alter table public.metadata_fields enable row level security;
alter table public.document_metadata_values enable row level security;
alter table public.citations enable row level security;
alter table public.document_discussions enable row level security;
alter table public.audit_log enable row level security;
alter table public.document_embeddings enable row level security;

-- Groups: admin write, all authenticated read
create policy "groups_admin_all" on public.user_groups for all using (public.is_admin());
create policy "groups_read" on public.user_groups for select using (auth.role() = 'authenticated');

create policy "group_members_admin_all" on public.user_group_members for all using (public.is_admin());
create policy "group_members_read" on public.user_group_members for select using (auth.role() = 'authenticated');

create policy "group_perms_admin_all" on public.group_doc_permissions for all using (public.is_admin());
create policy "group_perms_read" on public.group_doc_permissions for select using (auth.role() = 'authenticated');

-- Amendments
create policy "amend_read" on public.amendments for select using (public.doc_visible(document_id));
create policy "amend_insert" on public.amendments for insert with check (auth.uid() is not null and auth.uid() = proposer_id);
create policy "amend_update_self" on public.amendments for update using (auth.uid() = proposer_id and status = 'proposed');
create policy "amend_admin_decide" on public.amendments for update using (public.is_admin() or public.user_owns_doc(document_id));
create policy "amend_admin_delete" on public.amendments for delete using (public.is_admin() or auth.uid() = proposer_id);

create policy "amend_sup_read" on public.amendment_supporters for select using (auth.role() = 'authenticated');
create policy "amend_sup_self" on public.amendment_supporters for all using (auth.uid() = user_id);

-- Translations
create policy "trans_read" on public.document_translations for select using (
  public.doc_visible(document_id) or status = 'verified'
);
create policy "trans_insert" on public.document_translations for insert with check (
  public.is_editor_or_admin() or (
    auth.uid() in (select id from public.profiles where role = 'translator')
  )
);
create policy "trans_update" on public.document_translations for update using (
  public.is_editor_or_admin() or auth.uid() = translator_id
);

-- Metadata
create policy "meta_fields_read" on public.metadata_fields for select using (true);
create policy "meta_fields_admin" on public.metadata_fields for all using (public.is_admin());

create policy "meta_values_read" on public.document_metadata_values for select using (public.doc_visible(document_id));
create policy "meta_values_write" on public.document_metadata_values for all using (public.doc_editable(document_id));

-- Citations
create policy "cite_read" on public.citations for select using (public.doc_visible(document_id));
create policy "cite_write" on public.citations for all using (public.doc_editable(document_id));

-- Discussions
create policy "disc_read" on public.document_discussions for select using (public.doc_visible(document_id));
create policy "disc_write" on public.document_discussions for all using (public.doc_editable(document_id));

-- Audit log: admin only
create policy "audit_admin_read" on public.audit_log for select using (public.is_admin());

-- Embeddings
create policy "embed_read" on public.document_embeddings for select using (auth.role() = 'authenticated');
create policy "embed_admin_write" on public.document_embeddings for all using (public.is_editor_or_admin());

-- Update doc_visible to include group permissions
create or replace function public.doc_visible(doc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc_id
      and (
        d.status = 'approved'
        or (auth.uid() is not null and d.status in ('review','approved'))
        or public.is_editor_or_admin()
        or d.owner_id = auth.uid()
        or exists (
          select 1 from public.document_permissions p
          where p.document_id = d.id and p.user_id = auth.uid()
        )
        or public.user_group_can_read(d.document_type, d.status)
      )
  );
$$;

create or replace function public.doc_editable(doc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor_or_admin()
      or exists (select 1 from public.documents d where d.id = doc_id and d.owner_id = auth.uid())
      or exists (select 1 from public.document_permissions p
                 where p.document_id = doc_id and p.user_id = auth.uid() and p.can_edit)
      or exists (select 1 from public.documents d
                 where d.id = doc_id
                   and public.user_group_can_edit(d.document_type, d.status));
$$;
