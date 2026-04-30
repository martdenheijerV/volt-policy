# Applying migration 015_scoped_permissions on Hetzner

This is the concrete walkthrough for the cutover. The migration adds
the per-scope per-member permission model and rewrites the RLS
helpers. It is idempotent — re-running it after a partial failure is
safe.

## Prerequisites

- SSH access to the Hetzner VPS (you've used it before to deploy
  this app).
- Postgres 17 running on the VPS, either:
  - in the Docker compose at `deploy/docker-compose.yml` (service
    name: `db`), **or**
  - a host-installed Postgres reached via `localhost:5432`.
- A `psql`-compatible role with permission to run DDL on the
  application database (typically the `volt` user from the compose).

## Step 1 — get the migration file onto the VPS

If your repo is checked out on the VPS at `/srv/volt-policy`, the
file already lives at `db/migrations/015_scoped_permissions.sql`
once you `git pull`. Otherwise scp it from your laptop:

```bash
# from your laptop
scp db/migrations/015_scoped_permissions.sql \
    user@your-hetzner-host:/tmp/015_scoped_permissions.sql
```

## Step 2 — SSH in and pre-flight check

```bash
ssh user@your-hetzner-host
cd /srv/volt-policy   # or wherever the repo lives

# Confirm the seeded "Volt Europa" department exists — the migration
# uses it as the catchall for documents without an explicit scope.
docker compose exec db psql -U volt -d volt_policy -c \
  "select id, name from public.departments where name = 'Volt Europa';"
```

Expect one row. If it's missing, the migration's backfill will leave
existing documents with both group_id and department_id null, and
the XOR check at step 5 of the migration will fail. Re-seed first:

```bash
docker compose exec db psql -U volt -d volt_policy -c \
  "insert into public.departments (name) values ('Volt Europa') on conflict (name) do nothing;"
```

## Step 3 — apply the migration

If the SQL is in the repo on the VPS:

```bash
docker compose exec -T db psql -U volt -d volt_policy \
  < db/migrations/015_scoped_permissions.sql
```

If you scp'd it to /tmp:

```bash
docker compose cp /tmp/015_scoped_permissions.sql db:/tmp/015.sql
docker compose exec db psql -U volt -d volt_policy -f /tmp/015.sql
```

Without the compose (host-installed Postgres):

```bash
psql "$DATABASE_URL" -f db/migrations/015_scoped_permissions.sql
```

You'll see `BEGIN`, a stream of `CREATE FUNCTION` / `CREATE POLICY` /
`ALTER TABLE` notices, and `COMMIT` at the end. Anything that prints
`ERROR:` aborts the transaction — fix it and re-run; the file is
idempotent.

## Step 4 — verify

```bash
docker compose exec db psql -U volt -d volt_policy <<'SQL'
-- 1. The two new tables exist
\dt public.user_group_member_permissions
\dt public.department_member_permissions

-- 2. The XOR check is in place
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname = 'documents_scope_xor_chk';

-- 3. Every document has exactly one scope
select count(*) as offenders
  from public.documents
 where (group_id is null) = (department_id is null);

-- 4. Helpers were rewritten (look for one of the new helper names)
select proname from pg_proc
 where proname in ('can_publish_to_group', 'can_publish_to_department');
SQL
```

Expectations:
- Both tables print their column lists.
- The check definition is shown.
- `offenders` is 0.
- Both helpers appear in the last query.

## Step 5 — restart the app

The Next.js app picks up new helpers automatically via the
SECURITY DEFINER functions; no schema-file regeneration needed. But
restart so any cached query plans pick up the new column on
`documents`:

```bash
docker compose restart app hocuspocus
```

## Rollback (only if you have to)

The migration is one transaction, so a mid-run failure leaves nothing
behind. If you've committed and want to revert anyway, manually:

```sql
begin;
drop policy if exists documents_insert_scoped on public.documents;
alter table public.documents drop constraint if exists documents_scope_xor_chk;
alter table public.documents drop column if exists group_id;
drop table if exists public.user_group_member_permissions cascade;
drop table if exists public.department_member_permissions cascade;
-- The doc_visible / doc_editable rewrites are non-trivial to revert
-- byte-for-byte; pull the prior bodies from migration 008.
commit;
```

## Notes

- This migration retired the `group_doc_permissions` matrix as a
  source of truth. The table itself stays in place for audit history;
  it's just no longer consulted by RLS.
- `user_group_can_read` / `user_group_can_edit` are kept as no-op
  stubs so any straggler caller fails closed instead of throwing.
- Future migrations live in `db/migrations/`. The legacy
  `supabase/migrations/` directory is deprecated; remove it locally
  with `rm -rf supabase/` once you've confirmed `db/migrations/` is
  byte-identical.
