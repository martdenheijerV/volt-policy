-- 006_review_snapshot_and_policy_lead.sql
--
-- Two governance improvements:
--
-- 1. Review-snapshot architecture: when an editor clicks "Send to review",
--    we freeze a specific version as the review candidate. Admins approve
--    THAT snapshot (not whatever current_version happens to be when they
--    click). Editors are locked out of editing during status='review' so
--    the snapshot they sent up is exactly what gets approved.
--
-- 2. New `policy_lead` role: a user who can approve documents within a
--    scoped theme. Scoping is done via the existing group permission
--    system — a new `can_approve` flag on group_doc_permissions lets
--    admins delegate approval rights for specific (document_type, status)
--    combinations to a group. A policy_lead must be a member of such a
--    group; without that membership their approval power is identical to
--    a regular editor (= none). This means designating someone as
--    policy_lead is safe by default; the actual approve power is unlocked
--    only by the group permission.

-- 1. Add policy_lead to user_role enum.
--    Postgres requires the enum addition outside a transaction in some
--    versions; if you run this migration via psql -1, that's fine because
--    `add value if not exists` is idempotent.
alter type public.user_role add value if not exists 'policy_lead';

-- 2. Make sure approved_version_number exists. (Earlier code referenced it
--    but no migration file added it explicitly — make this idempotent.)
alter table public.documents
  add column if not exists approved_version_number int;

-- 3. Add review_version_number — the frozen candidate while status='review'.
alter table public.documents
  add column if not exists review_version_number int;

-- 4. Add can_approve to group permissions. Default false so existing rows
--    don't accidentally hand out approve rights.
alter table public.group_doc_permissions
  add column if not exists can_approve boolean not null default false;

-- 5. Helper: can the current user approve this document?
--    Admins always can. Policy leads can if a group they're in has a
--    can_approve=true permission rule that matches this doc's type and
--    current status (or a permissive rule that leaves type/status null).
--    SECURITY DEFINER so the function bypasses RLS while still enforcing
--    its own logic — same pattern as is_admin / doc_editable.
create or replace function public.can_approve_doc(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (
    select id, role from public.profiles
     where id = public.current_user_id()
  ),
  doc as (
    select id, document_type, status from public.documents where id = d_id
  )
  select
    coalesce((select role = 'admin' from me), false)
    or (
      coalesce((select role = 'policy_lead' from me), false)
      and exists (
        select 1
          from public.user_group_members m
          join public.group_doc_permissions p on p.group_id = m.group_id
          join doc on true
         where m.user_id = (select id from me)
           and p.can_approve = true
           and (p.document_type is null or p.document_type = doc.document_type)
           and (p.status is null or p.status = doc.status)
      )
    );
$$;

grant execute on function public.can_approve_doc(uuid) to public;

-- 6. Tighten doc_editable: when status='review', only admins (and
--    policy_leads who can approve this doc) may edit. Everyone else is
--    locked out so the snapshot under review can't drift.
--
--    NB: parameter name MUST stay `p_doc` to match the previous migration.
--    Postgres rejects parameter renames in `create or replace function`
--    when other objects (RLS policies) depend on the function signature.
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
      -- Status=review locks editing to approvers only (admin or
      -- can_approve policy_lead). This implements the "editors can't
      -- modify the review candidate" rule.
      when (select status from doc) = 'review' then
        public.can_approve_doc(p_doc)
      -- Status=archived: locked for everyone except admins (they may
      -- restore via a new version).
      when (select status from doc) = 'archived' then
        coalesce((select role = 'admin' from me), false)
      else
        -- Normal edit gate: admin, editor, doc owner, explicit
        -- per-doc permission, or group-based edit rule.
        coalesce((select role = 'admin' from me), false)
        or coalesce((select role = 'editor' from me), false)
        or (select owner_id from doc) = (select id from me)
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
