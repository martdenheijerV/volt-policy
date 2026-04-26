# EU-pure migration — handoff for next Claude session

**Goal**: replace every Supabase dependency with EU-only alternatives, per
`CLAUDE.md` principle #7. The app must keep all features. After this
migration, `package.json` no longer contains `@supabase/*` and the running
service depends on **zero US-incorporated companies**.

## Current state (paused at a safe checkpoint)

The running app still works on the existing Supabase Cloud project — login
page and middleware were intentionally NOT switched over yet, so testing
remains possible during the migration.

### Already built (foundation in place, unused by running app)

```
lib/auth/
  config.ts        # env vars: OIDC_*, COOKIE_*
  oidc.ts          # openid-client (CZ) wrapper, PKCE flow
  session.ts       # JWT-signed cookies via jose (CZ)
  server.ts        # getSession() / getCurrentUserId() / clearSession()
  middleware.ts    # authMiddleware() — replacement for Supabase middleware

lib/db/
  sql.ts           # postgres (DK) connection pool + withUser() helper
  client.ts        # Supabase-API-compatible shim (.from/.select/.eq/.in/...)

app/api/auth/
  login/route.ts     # initiates OIDC flow with PKCE
  callback/route.ts  # exchanges code, upserts profile by oidc_sub, sets cookie
  signout/route.ts   # clears session cookie
```

### Intentionally still on Supabase (revert markers in code)

- `middleware.ts` — still imports from `lib/supabase/middleware`.
- `app/login/page.tsx` — still uses `@supabase/ssr` `signInWithOAuth`.
- All ~80 server actions and pages still use `import { createClient } from
  "@/lib/supabase/server"`.
- `app/auth/callback/route.ts` (the OLD one) is still in place for Supabase
  OAuth callback. The new EU-pure callback lives at `app/api/auth/callback`.

## Required new env vars (production)

```
DATABASE_URL=postgres://postgres:<pwd>@localhost:5432/postgres
OIDC_ISSUER_URL=https://auth.volteuropa.org/realms/volt
OIDC_CLIENT_ID=volt-policy
OIDC_CLIENT_SECRET=<from Volt Auth>
OIDC_REDIRECT_URI=https://policy.volteuropa.org/api/auth/callback
OIDC_SCOPE=openid profile email
COOKIE_SECRET=<base64 of 32 random bytes>
COOKIE_NAME=volt_session
```

## Migration steps (in order)

### Step 1 — Schema migration (`supabase/migrations/005_eu_pure_auth.sql`)

```sql
-- 1. Add oidc_sub column to profiles (replaces auth.users.id linkage).
alter table public.profiles
  add column if not exists oidc_sub text unique;

-- 2. Drop trigger that auto-creates profile on auth.users insert
--    (no longer needed: we upsert in the new callback route).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 3. Replace every auth.uid() in policies with current_setting-based helpers.
--    These run as superuser via SECURITY DEFINER, no auth schema needed.
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
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

create or replace function public.current_user_role_setting()
returns text language sql stable as $$
  select coalesce(current_setting('app.role', true), 'anon');
$$;

-- 4. Rewrite all RLS policies that used auth.uid() to use current_user_id().
--    Search the existing migrations for auth.uid() / auth.role() and replace.
--    Examples:

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (public.current_user_id() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (public.current_user_id() = id);

drop policy if exists "profiles_authenticated_read_names" on public.profiles;
create policy "profiles_authenticated_read_names" on public.profiles
  for select using (public.current_user_role_setting() = 'authenticated');

-- ... and so on for every table. Search all migrations for `auth.uid()`
-- and `auth.role()` and replace systematically.

-- 5. doc_visible(), doc_editable(), user_owns_doc(), user_has_doc_permission(),
--    user_group_can_read/edit() — already SECURITY DEFINER, just replace
--    auth.uid() with public.current_user_id() in each body.

-- 6. handle_new_user trigger replacement — none needed; the OIDC callback
--    upserts profiles directly.
```

### Step 2 — Replace imports (mechanical, ~80 files)

For every file containing `from "@/lib/supabase/server"`:
```diff
- import { createClient } from "@/lib/supabase/server";
+ import { createClient } from "@/lib/db/client";
```

For every file containing `from "@/lib/supabase/client"` (client components):
- Replace with a thin local helper that just reads the JWT cookie via a fetch
  to `/api/auth/me` (you'll need to build that route too — returns
  `{ user: { id, email, name } | null }`).
- Or refactor those client components to receive the user as a prop from a
  server component.

Files to update (search results from current code):
```
app/(app)/admin/groups/[id]/GroupActions.tsx       (client)
app/(app)/admin/users/UserRow.tsx                  (client)
app/(app)/dashboard/page.tsx
app/(app)/documents/[id]/amendments/actions.ts
app/(app)/documents/[id]/amendments/page.tsx
app/(app)/documents/[id]/citations/actions.ts
app/(app)/documents/[id]/citations/page.tsx
app/(app)/documents/[id]/compare/page.tsx
app/(app)/documents/[id]/discussion/actions.ts
app/(app)/documents/[id]/discussion/page.tsx
app/(app)/documents/[id]/history/page.tsx
app/(app)/documents/[id]/page.tsx
app/(app)/documents/[id]/translations/[lang]/page.tsx
app/(app)/documents/[id]/translations/actions.ts
app/(app)/documents/[id]/translations/page.tsx
app/(app)/documents/actions.ts
app/(app)/documents/new/page.tsx
app/(app)/documents/page.tsx
app/(app)/admin/groups/actions.ts
app/(app)/admin/groups/page.tsx
app/(app)/admin/metadata/actions.ts
app/(app)/admin/metadata/page.tsx
app/(app)/admin/users/page.tsx
app/(app)/dashboard/page.tsx
app/(app)/layout.tsx
app/(app)/settings/page.tsx
app/api/ai/draft/route.ts
app/api/ai/similar/route.ts
app/api/documents/[id]/export/route.ts
app/api/documents/import/route.ts
app/api/lang/route.ts
app/api/scim/v2/Users/route.ts
app/api/scim/v2/Users/[id]/route.ts
app/auth/signout/route.ts
app/help/layout.tsx
app/library/[slug]/page.tsx
app/library/layout.tsx
app/library/page.tsx
app/login/page.tsx
app/page.tsx
app/signup/page.tsx
lib/i18n/server.ts
```

### Step 3 — Refactor join queries (5 spots, raw SQL)

The shim doesn't support PostgREST's foreign-key join syntax
(`profiles:author_id(full_name)`). These need raw SQL via the `postgres`
library directly. Files:

```
app/(app)/admin/groups/[id]/page.tsx     (members + profiles)
app/(app)/dashboard/page.tsx              (versions + profiles)
```

Pattern:
```ts
import { getSql, withUser } from "@/lib/db/sql";

const userId = await getCurrentUserId();
const rows = await withUser(userId, async (sql) => {
  return await sql`
    select v.id, v.created_at, v.author_id, p.full_name
    from document_versions v
    left join profiles p on p.id = v.author_id
    where v.created_at >= ${since}
  `;
});
```

### Step 4 — Switch middleware.ts and login/page.tsx to new auth

```ts
// middleware.ts
import { authMiddleware } from "@/lib/auth/middleware";
export async function middleware(request) { return authMiddleware(request); }
```

```tsx
// app/login/page.tsx — replace entire file with the version that lives at
// app/api/auth/login (single-button "Continue with Volt Auth").
```

Delete:
- `app/signup/page.tsx` (signup happens in Volt Auth)
- `app/auth/signout/route.ts` (replaced by `app/api/auth/signout/route.ts`)
- `app/auth/callback/route.ts` (Supabase callback, replaced)

Update the signout form on every page from `<form action="/auth/signout">`
to `<form action="/api/auth/signout">`. Search: `/auth/signout` in tsx
files.

### Step 5 — Remove Supabase from package.json

```bash
npm uninstall @supabase/ssr @supabase/supabase-js
```

Delete `lib/supabase/` folder entirely.

### Step 6 — Update DEPLOY.md

Replace section 4 ("Self-host Supabase") with:

```
## 4. Self-host Postgres + Authentik

In Coolify:
- New Resource → Database → Postgres 17 → set strong password.
  Note connection string for DATABASE_URL.
- New Resource → Service → Authentik:
  - Templates: pick "Authentik" (Goauthentik project, German).
  - Domain: auth.policy.volteuropa.org
  - Bootstrap admin email: ops@volteuropa.org
  - After boot: register an OIDC client in Authentik admin:
    - Client ID: volt-policy
    - Redirect URI: https://policy.volteuropa.org/api/auth/callback
    - Scopes: openid profile email
    - Note client secret → OIDC_CLIENT_SECRET env var on the app.

If Volt Auth already exists elsewhere, point OIDC_ISSUER_URL at it instead
and skip Authentik.
```

Also remove all references to `@supabase/*` env vars and replace
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` with the new
ones from "Required new env vars" above.

### Step 7 — Type-check + smoke-test

```bash
npx tsc --noEmit
npm run build
```

Smoke test locally:
1. Start Postgres + Authentik via docker compose.
2. Create the schema (run all migrations including the new 005).
3. Register an OIDC client in Authentik.
4. Set env vars in `.env.local`.
5. `npm run dev` → http://localhost:3000 → click "Continue with Volt Auth".
6. Walk through the testplan from earlier sessions.

## Risks / known gotchas

1. **Profile-deletion cascade** — the old `auth.users on delete cascade
   profiles.id` will break when auth.users is gone. The new model: profile
   deletion is the source of truth. Check FKs.

2. **Storage features** — currently unused but Supabase Storage is in the
   stack. If file upload is added later, swap for MinIO (German).

3. **Browser-side client** — components that did
   `supabase.auth.signOut()` from the browser need to POST to
   `/api/auth/signout` instead. The Nav component already uses a form, so
   just update the action URL.

4. **Realtime** — already swapped to HocusPocus, no Supabase Realtime use.

5. **postgres-js prepared statements with `set local`** — make sure
   `withUser()` always wraps queries in `sql.begin()`. If a query escapes
   the transaction, RLS won't see the user_id and queries will fail
   silently with empty results.

## Estimate

Total work: **~4 hours focused**. Mostly mechanical edits.

## Acceptance criteria

- [ ] `grep -r "@supabase" --include="*.ts" --include="*.tsx" .` returns
      nothing in `app/`, `lib/`, `components/`.
- [ ] `package.json` has no `@supabase/*` dependencies.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npm run build` succeeds.
- [ ] On a fresh Postgres + Authentik install, login flow round-trips end
      to end and lands on `/dashboard`.
- [ ] All earlier features (editor, comments, amendments, translations,
      exports, AI panel, admin pages) still work.
- [ ] `CLAUDE.md` principle #7 is satisfied: every dependency in
      `package.json` is either an EU-incorporated company's product or
      community-maintained open source with no US-only stewardship.
