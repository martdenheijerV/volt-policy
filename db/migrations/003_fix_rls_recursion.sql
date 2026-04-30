-- 003_fix_rls_recursion.sql
--
-- Replace recursive RLS policies (documents <-> document_permissions,
-- documents <-> document_versions, etc.) with SECURITY DEFINER helper
-- functions. The helpers bypass RLS internally so they can read the
-- relevant rows without triggering the same policy they're being
-- evaluated for.

create or replace function public.user_has_doc_permission(doc_id uuid, edit_required boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.document_permissions p
    where p.document_id = doc_id
      and p.user_id = auth.uid()
      and (not edit_required or p.can_edit)
  );
$$;

create or replace function public.user_owns_doc(doc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = doc_id and d.owner_id = auth.uid()
  );
$$;

create or replace function public.doc_visible(doc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
      )
  );
$$;

create or replace function public.doc_editable(doc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_editor_or_admin()
      or exists (select 1 from public.documents d where d.id = doc_id and d.owner_id = auth.uid())
      or exists (select 1 from public.document_permissions p
                 where p.document_id = doc_id and p.user_id = auth.uid() and p.can_edit);
$$;

-- DOCUMENTS: replace the recursive policies
drop policy if exists "documents_explicit_permission_read" on public.documents;
drop policy if exists "documents_update" on public.documents;

create policy "documents_explicit_permission_read" on public.documents
  for select using (public.user_has_doc_permission(id, false));

create policy "documents_update" on public.documents
  for update using (
    public.is_admin()
    or auth.uid() = owner_id
    or public.user_has_doc_permission(id, true)
  );

-- DOCUMENT VERSIONS: rewrite via the helper functions
drop policy if exists "versions_read" on public.document_versions;
drop policy if exists "versions_insert" on public.document_versions;

create policy "versions_read" on public.document_versions
  for select using (public.doc_visible(document_id));

create policy "versions_insert" on public.document_versions
  for insert with check (public.doc_editable(document_id));

-- COMMENTS: rewrite via doc_visible
drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments
  for select using (public.doc_visible(document_id));

-- DOCUMENT PERMISSIONS: replace owner policy with definer function
drop policy if exists "perms_owner_manage" on public.document_permissions;
create policy "perms_owner_manage" on public.document_permissions
  for all using (public.user_owns_doc(document_id));
