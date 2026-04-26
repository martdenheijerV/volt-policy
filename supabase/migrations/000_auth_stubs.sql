-- 000_auth_stubs.sql
--
-- Compat shim: the original 001-004 migrations were written against
-- Supabase Cloud's `auth` schema (auth.users, auth.uid(), auth.role()).
-- On plain self-hosted Postgres that schema doesn't exist, so 001-004
-- would fail before migration 005 has a chance to rewire them.
--
-- This file creates a no-op auth schema with stub functions that read
-- from the session-local `app.user_id` and `app.role` GUC variables.
-- The application sets these inside `withUser()` (lib/db/sql.ts) so the
-- existing RLS policies keep working until migration 005 swaps them
-- out for the explicit current_user_id() / current_user_role_setting()
-- helpers.
--
-- Safe to re-run.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language plpgsql
stable
as $$
declare
  v text;
begin
  v := current_setting('app.user_id', true);
  if v is null or v = '' then return null; end if;
  return v::uuid;
exception when others then
  return null;
end;
$$;

create or replace function auth.role()
returns text
language plpgsql
stable
as $$
declare
  v text;
begin
  v := current_setting('app.role', true);
  if v is null or v = '' then return 'anon'; end if;
  return v;
exception when others then
  return 'anon';
end;
$$;
