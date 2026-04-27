# Volt Policy Management — MVP

A Next.js 15 + self-hosted Postgres policy management system for Volt
political documents. Covers the four highest-priority requirement
clusters from the spec:

1. **Core doc CRUD + storage** (single source of truth, metadata, prefix info)
2. **Editor, versioning, comments** (collaborative draft → review → approved workflow)
3. **Auth, roles, permissions** (admin / editor / member / translator + per-doc overrides)
4. **Search + public interface** (full-text search, public library with no login)

## Stack (EU-pure — see `CLAUDE.md` principle #7)

- **Next.js 15** (App Router, React 19, TypeScript)
- **Postgres 17** (self-hosted on Hetzner; `postgres-js` driver — Danish)
- **Volt Auth / Authentik** (OIDC; `openid-client` — Czech)
- **`jose`** for signed session cookies (Czech)
- **Tailwind CSS** (Volt-flavored purple + Ubuntu font)

No external rich-text library — the editor uses Markdown with a tiny
dependency-free renderer, so the MVP stays small and the storage format is
portable (Requirement #36: prevent vendor lock-in).

## Getting started

```bash
# from /Users/martdenheijer/Documents/Claude/Projects/testV
npm install          # dependencies already pulled once
npm run dev          # http://localhost:3000
```

Configure `.env.local` with the EU-pure stack credentials:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
OIDC_ISSUER_URL=https://auth.volteuropa.org/realms/volt
OIDC_CLIENT_ID=volt-policy
OIDC_CLIENT_SECRET=<from Volt Auth>
OIDC_REDIRECT_URI=http://localhost:3000/api/auth/callback
COOKIE_SECRET=<openssl rand -base64 32>
COOKIE_NAME=volt_session
```

### First run

1. Apply the migrations (in order, including `005_eu_pure_auth.sql`)
   against your Postgres.
2. Configure Volt Auth (or a local Authentik) with a confidential OIDC
   client whose redirect URI is `http://localhost:3000/api/auth/callback`.
3. Visit `http://localhost:3000` → click **Continue with Volt Auth**.
   The first profile that lands also gets the `admin` role (see the
   `first_user_is_admin` migration).
4. Sign in, create a document, send it to review, then approve it.
5. Open `/library` (or browse in an incognito window) to see the public
   view of approved documents — no login required.

### Production build

```bash
npm run build
npm start
```

## Project layout

```
app/
  page.tsx                            # public landing
  login/, signup/                     # auth forms
  auth/signout/                       # POST /auth/signout
  library/                            # public, anon-readable
    page.tsx                          # search + list approved docs
    [slug]/page.tsx                   # public read-only document
  (app)/                              # authenticated (auth checked in layout + middleware)
    layout.tsx                        # nav + profile fetch
    dashboard/page.tsx                # status counts + recent activity
    documents/
      page.tsx                        # searchable/filterable list
      new/page.tsx                    # create form with prefix info
      [id]/page.tsx                   # editor + comments
      [id]/history/page.tsx           # version history + restore
      actions.ts                      # server actions (create/save/approve/comment)
    admin/users/page.tsx              # admin-only role management
components/
  Nav.tsx                             # main nav + role badge
  DocumentEditor.tsx                  # edit/preview, save new version, status controls
  CommentsPanel.tsx                   # threaded, anchored, resolvable comments
lib/
  auth/{config,session,server,middleware,oidc,browser}.ts
  db/{sql,client}.ts                  # postgres-js pool + PostgREST-shape shim
  markdown.ts                         # safe Markdown → HTML
  types.ts                            # shared TS types
  utils.ts                            # slugify, formatDate, status classes
middleware.ts                         # JWT cookie check + auth gating
```

## Database schema

Migrations live in `supabase/migrations/`. Apply them in order against the
self-hosted Postgres on Hetzner; `005_eu_pure_auth.sql` is the one that
removes the `auth.users` linkage.

- **profiles** — keyed by internal `id` (uuid), unique by `oidc_sub`. The
  OIDC callback (`/api/auth/callback`) upserts on `oidc_sub`.
- **documents** — core document with metadata, tags, status enum, generated
  tsvector for full-text search (weighted: title > purpose > content).
- **document_versions** — immutable history, unique `(document_id,
  version_number)`. Used for restore.
- **comments** — threaded, optionally anchored to a quote, resolvable, with
  `author_name_cached` so names can survive user deletion (GDPR req #12).
- **document_permissions** — per-user overrides (grant edit/comment access
  outside the role system).

### RLS summary

| Actor | Documents | Versions | Comments |
|---|---|---|---|
| Anonymous | read where `status='approved'` | read for approved docs | — |
| Member (logged in) | read review + approved | same | read + create on visible docs |
| Editor | read/create all; update own | create versions | — |
| Admin | full | full | full |
| Owner | read own drafts | create versions | — |
| Per-doc permission | read + optional edit | — | — |

Role checks go through `SECURITY DEFINER` functions
(`public.is_admin`, `public.is_editor_or_admin`) to avoid RLS recursion.

## Requirements coverage (from your spec)

### Shipped in this MVP

| # | Requirement | Where |
|---|---|---|
| 1 | Adaptability of MVP | Modular RLS + enums make it trivial to extend |
| 2 | Storage system / single source of truth | `documents`, `document_versions` tables |
| 3 | Public search interface (no login) | `/library`, `/library/[slug]` |
| 4 | WCAG-conscious UI | Focus rings, labels, `role="alert"/"status"`, semantic markup |
| 10 | User roles & access | `user_role` enum + RLS policies |
| 11 | Document permissions | `document_permissions` table + RLS |
| 12 | GDPR-friendly deletes | `author_name_cached` on comments |
| 17 | Track changes | Every save creates a `document_versions` row with `change_summary` |
| 18 | Commenting + reply + resolve | `CommentsPanel.tsx`, `parent_id`, `resolved` |
| 22 | Metadata on documents | `document_type`, `language`, `tags`, `purpose`, `owner_id` |
| 23 | Prefixed information required | New-document form enforces title + type + language |
| 24 | Version control | `/documents/[id]/history` |
| 26 | History preservation | `document_versions` immutable; author + timestamp + summary |
| 27 | Document restoration | "Restore" button creates a new version from an old one |
| 28 | Structural formatting only | Markdown (no colors/fonts), renderer strips inline HTML |
| 29 | Volt style | Tailwind theme: volt purple palette, Ubuntu font stack |
| 36 | Export / no lock-in | Storage is plain Markdown text; Supabase = standard Postgres |

### Intentionally stubbed or out-of-scope for this session

| # | Requirement | Next step |
|---|---|---|
| 5 | SSO (OIDC, Volt Auth) | Configure Supabase Auth → SSO providers; hide password login |
| 6 | Chat per document | Add a `discussion_threads` table or embed Matrix/Mattermost iframe |
| 7 | Help center / guidelines | Add MDX-powered `/help` section |
| 9 | Default system language | Already have `profiles.language_pref`; wire up an i18n layer (e.g. `next-intl`) |
| 13 | Text change permission (formal input required) | Already have `change_summary` input; make required server-side for review/approved docs |
| 14 | Integrated amendment tool | Add `amendments` table + MotionTools-style inline amendments |
| 15 | Real-time multi-user collaboration | Swap the Markdown editor for Y.js/Tiptap over Supabase Realtime |
| 16 | Default suggestion mode | Toggle already present in editor; needs persistence of suggestions vs. direct edits |
| 19 | Language/grammar checks | Integrate LanguageTool API |
| 20/21 | AI: similar docs / drafting | pgvector + embeddings in Supabase + Anthropic API |
| 25 | Version statistics | Materialized view over `document_versions` |
| 30-33 | Translation (auto, DeepL, verified) | Add `translations` table keyed to `(document_id, language)`; DeepL side-by-side UI |
| 34 | Citation management (Zotero) | Zotero OAuth + bibliography field on documents |
| 35, 40 | Printing / accessible export | Print stylesheet + server endpoint returning `.md`/`.html`/`.docx` |
| 37 | EU Data Act API | Supabase auto-exposes REST + GraphQL; document the OpenAPI schema |
| 38 | SCIM provisioning | Add `/api/scim/v2/*` route handlers reading `profiles` |
| 39 | CEFR complexity analysis | Call the `mock-cminor` Python service on save |
| 41 | Document import (PDF/DOCX) | Add upload → pandoc or unstructured.io → Markdown |

## Build verification note

`npx tsc --noEmit` passes cleanly; `next build` compiles successfully (the
sandbox that built this MVP can't hold a process long enough to run the full
~60s production build to completion, so please run `npm run build` locally
as a final check before deploying).

## Deploying

See `DEPLOY.md` for the full Hetzner + Coolify + Authentik walk-through.
Short version:

- **Postgres + Authentik** on a Hetzner CX32 in Falkenstein (DE) via Coolify.
- **App** built from this repo's `Dockerfile`, deployed in the same Coolify.
- **Env vars**: `DATABASE_URL`, `OIDC_*`, `COOKIE_*` plus optional
  `MISTRAL_API_KEY`, `DEEPL_API_KEY`, `LANGUAGETOOL_URL`, `SCIM_TOKEN`.
- **Email**: Brevo (FR) configured as Authentik's outbound SMTP.

