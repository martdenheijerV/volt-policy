-- 008_doc_types_edit_rights_default_suggest.sql
--
-- Three changes, all reinforcing the "single source of truth" principle:
--
-- 1. Extend the doc_type enum with the new political-document categories
--    Mart's team needs (touchstones, roadmaps at three levels, electoral
--    programmes, campaign programmes, best practices, EO speeches). Stays
--    a Postgres enum so RLS rules + group_doc_permissions filtering keep
--    working unchanged.
--
-- 2. Suggestion-mode-by-default: tighten doc_editable so that the bare
--    `editor` role no longer grants automatic write access. Editors must
--    explicitly receive edit rights for a specific document via either
--    document_permissions or group_doc_permissions. Without those, they
--    can read + comment + suggest but cannot type. Admins, doc owners
--    and policy_leads who can_approve this doc keep their auto-edit
--    bypass (otherwise governance breaks).
--
-- 3. New `edit_rights_requests` table + helpers so members/editors who
--    want to type can ask the owner / admin / scoped policy_lead, and
--    those approvers can grant or deny via the UI. Approval flips a
--    document_permissions row to can_edit=true.
--
-- All idempotent. Run via: ssh volt@<host> 'docker exec -i <db_container>
-- psql -U postgres -d postgres' < 008_*.sql

-- ============================================================
-- 1. Extend doc_type enum
-- ============================================================
alter type public.doc_type add value if not exists 'touchstone';
alter type public.doc_type add value if not exists 'roadmap_europe';
alter type public.doc_type add value if not exists 'roadmap_national';
alter type public.doc_type add value if not exists 'roadmap_local';
alter type public.doc_type add value if not exists 'electoral_programme_europe';
alter type public.doc_type add value if not exists 'electoral_programme_national';
alter type public.doc_type add value if not exists 'electoral_programme_local';
alter type public.doc_type add value if not exists 'campaign_programme_europe';
alter type public.doc_type add value if not exists 'campaign_programme_national';
alter type public.doc_type add value if not exists 'campaign_programme_local';
alter type public.doc_type add value if not exists 'best_practice';
alter type public.doc_type add value if not exists 'eo_speech';

-- ============================================================
-- 2. Suggestion-mode-by-default: doc_editable tightened
-- ============================================================
--
-- Same signature as 006 (parameter MUST stay `p_doc`). The only behaviour
-- change is removing the `role = 'editor'` auto-allow from the else
-- branch. Everything else (admin bypass, owner bypass, explicit doc-perm,
-- group-based perm, review-lock, archived-lock) is preserved.
create or replace function public.doc_editable(p_doc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select id, role from public.profiles
     where id = public.current_user_id()
  ),
  doc as (
    select id, owner_id, document_type, status from public.documents
     where id = p_doc
  )
  select
    case
      when (select status from doc) = 'review' then
        public.can_approve_doc(p_doc)
      when (select status from doc) = 'archived' then
        coalesce((select role = 'admin' from me), false)
      else
        -- Default = suggestion-mode for everyone except:
        --   * admins (always)
        --   * the document owner (so the creator can keep editing
        --     their own draft without filing a request against
        --     themselves)
        --   * policy_leads with can_approve on this doc (covers the
        --     review-lock approver path)
        --   * users with an explicit document_permissions.can_edit row
        --     (this is what the new edit-rights-request flow grants)
        --   * users in a group with group_doc_permissions.can_edit for
        --     this (type, status) — pre-granted by an admin
        coalesce((select role = 'admin' from me), false)
        or (select owner_id from doc) = (select id from me)
        or public.can_approve_doc(p_doc)
        or exists (
          select 1 from public.document_permissions dp
           where dp.document_id = p_doc
             and dp.user_id = (select id from me)
             and dp.can_edit = true
        )
        or exists (
          select 1 from public.user_group_members m
            join public.group_doc_permissions p on p.group_id = m.group_id
            join doc on true
           where m.user_id = (select id from me)
             and p.can_edit = true
             and (p.document_type is null or p.document_type = doc.document_type)
             and (p.status is null or p.status = doc.status)
        )
    end;
$$;

grant execute on function public.doc_editable(uuid) to public;

-- ============================================================
-- 3. edit_rights_requests
-- ============================================================
create type public.edit_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table if not exists public.edit_rights_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  -- GDPR-friendly cached display name; preserved if profile is deleted.
  requester_name_cached text,
  message text,
  status public.edit_request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one open request per (doc, requester); a user can re-request after
-- their previous one was decided.
create unique index if not exists edit_rights_requests_one_pending
  on public.edit_rights_requests (document_id, requester_id)
  where status = 'pending';

create index if not exists edit_rights_requests_doc_idx
  on public.edit_rights_requests (document_id, status);
create index if not exists edit_rights_requests_requester_idx
  on public.edit_rights_requests (requester_id, status);

create trigger edit_rights_requests_updated_at before update on public.edit_rights_requests
  for each row execute function public.set_updated_at();

alter table public.edit_rights_requests enable row level security;

-- Helper: can current user decide this request? Admin OR doc owner OR
-- policy_lead with can_approve on this doc. Mirrors the user's design.
create or replace function public.can_decide_edit_request(req_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with req as (
    select document_id from public.edit_rights_requests where id = req_id
  ),
  d as (
    select id, owner_id from public.documents
     where id = (select document_id from req)
  )
  select
    coalesce((select role = 'admin' from public.profiles where id = public.current_user_id()), false)
    or (select owner_id from d) = public.current_user_id()
    or public.can_approve_doc((select id from d));
$$;

grant execute on function public.can_decide_edit_request(uuid) to public;

-- Policies:
--  * The requester can read their own requests.
--  * Admins / owner / can_approve can read all requests for that doc.
--  * Anyone authenticated can INSERT a request for themselves on a doc
--    they can already read (doc_visible). They can't insert for someone
--    else (requester_id must = current user).
--  * Updates: only admin / owner / can_approve. Plus the requester can
--    cancel their own pending request.
create policy "edit_req_self_read" on public.edit_rights_requests
  for select using (requester_id = public.current_user_id());

create policy "edit_req_decider_read" on public.edit_rights_requests
  for select using (
    coalesce((select role = 'admin' from public.profiles where id = public.current_user_id()), false)
    or exists (
      select 1 from public.documents d
       where d.id = edit_rights_requests.document_id
         and d.owner_id = public.current_user_id()
    )
    or public.can_approve_doc(edit_rights_requests.document_id)
  );

create policy "edit_req_insert_self" on public.edit_rights_requests
  for insert with check (
    requester_id = public.current_user_id()
    and public.doc_visible(document_id)
  );

create policy "edit_req_decider_update" on public.edit_rights_requests
  for update using (
    coalesce((select role = 'admin' from public.profiles where id = public.current_user_id()), false)
    or exists (
      select 1 from public.documents d
       where d.id = edit_rights_requests.document_id
         and d.owner_id = public.current_user_id()
    )
    or public.can_approve_doc(edit_rights_requests.document_id)
  );

create policy "edit_req_self_cancel" on public.edit_rights_requests
  for update using (
    requester_id = public.current_user_id()
    and status = 'pending'
  );

-- Convenience: when a request is approved, mirror it into
-- document_permissions(can_edit=true). Idempotent: if a row already
-- exists, just flip can_edit.
create or replace function public.apply_approved_edit_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'approved' and (old.status is distinct from 'approved')) then
    insert into public.document_permissions (document_id, user_id, can_edit, can_comment)
      values (new.document_id, new.requester_id, true, true)
      on conflict (document_id, user_id) do update
        set can_edit = true,
            can_comment = true;
  end if;
  return new;
end;
$$;

drop trigger if exists edit_rights_requests_apply on public.edit_rights_requests;
create trigger edit_rights_requests_apply
  after update on public.edit_rights_requests
  for each row execute function public.apply_approved_edit_request();
