# Volt Policy Management — guardrails

Single source of truth for Volt's political documents (policies, positions,
resolutions, statements, motions). Built on Next.js 15 (App Router, RSC) +
self-hosted Postgres 17 (with RLS) + OIDC via Authentik + Tiptap.

> **No-Supabase principle.** This project does not use Supabase in any
> form — not the cloud platform, not the self-hosted Docker compose,
> not any `@supabase/*` npm package. The data layer is a thin
> hand-written PostgREST-style shim (`lib/db/client.ts`) on top of
> the `postgres` driver. The auth layer is OIDC against Authentik
> (`lib/auth/*`). Reintroducing Supabase — as a dependency, as a
> hosting choice, or as terminology in code, comments, or
> documentation — is forbidden. If a future requirement seems to
> need it, raise the conflict explicitly before implementing.

## Inviolable principles

These five constraints come from the original requirements list and **must not
be broken by any future feature**. If a new requirement appears to conflict
with one of these, surface the conflict explicitly before implementing.

### 1. The MVP must stay adaptable

New requirements should be addable without rewriting existing modules.

**Implications**:
- New roles, document types or statuses go through the Postgres enums
  (`user_role`, `doc_type`, `doc_status`) — never hard-coded in client code.
- Permission checks go through the `SECURITY DEFINER` helpers
  (`is_admin`, `is_editor_or_admin`, `doc_visible`, `doc_editable`,
  `can_approve_doc`, `can_publish_to_group`, `can_publish_to_department`).
  New permission sources extend these helpers, not the policies that
  call them. The legacy `user_group_can_read/edit` are kept as no-op
  stubs for backward compatibility — do not call them.
- Custom per-organization fields go through `metadata_fields` +
  `document_metadata_values`, never via schema migrations.
- New languages go through `lib/i18n/dictionaries.ts`, never hard-coded.
- Editor extensions go through Tiptap (extensions in `components/`),
  never via a fork of Tiptap.

**Forbidden**: bespoke single-purpose tables for things that fit existing
generic tables; switching to a non-Postgres data store; framework-specific
syntax that locks us out of `pg_dump → restore elsewhere`.

### 2. Single source of truth in Postgres

All Volt political documents — and everything attached to them — live
in a single self-hosted Postgres 17 database running on the Volt-
controlled Hetzner VPS in eu-west.

**Implications**:
- The editor, public library, exports, translations, amendments, search and
  the SCIM endpoints all read from the **same `documents` row**. Never
  introduce a parallel store, cache that becomes the new source of truth, or
  duplicate doc copies in another SaaS.
- Cross-table relations cascade from `documents.id`. Deleting a document
  removes its versions, comments, amendments, translations, citations,
  permissions, embeddings — automatically.
- Storage format stays interoperable: HTML in `documents.current_content`,
  trivially convertible to Markdown / DOCX / plain text. No proprietary
  binary blobs as canonical content.

**Forbidden**: storing canonical document content outside Postgres;
introducing a "publish" pipeline that copies content into a second
read-store; non-recoverable schema migrations.

### 3. Public layer for non-members, no login required

Approved documents are publicly readable at `/library` and
`/library/<slug>` without authentication.

**Implications**:
- The RLS policy `documents_public_read_approved` (and matching policies on
  `document_translations` for `status = 'verified'`) is the contract.
  Removing or weakening these breaks the public layer.
- The public layer reads from the same `documents` table — no sync job, no
  separate "published" mirror.
- `status` transitions (`draft → review → approved → archived`) are the only
  mechanism that controls public visibility.

**Forbidden**: putting any login/cookie wall in front of `/library` or
`/library/<slug>`; making approved docs invisible to anonymous users for any
reason short of a takedown; exposing `draft` or `review` content publicly.

### 4. WCAG 2.2 AA-compliant, engaging interface

Every UI surface stays accessible to keyboard-only users, screen readers,
and users with visual or motor impairments.

**Implications**:
- Use semantic HTML (`header`, `nav`, `main`, `article`, `aside`, `button`,
  `label`+`htmlFor`). Never click-handlers on `<div>` for primary actions.
- Icon-only buttons get `aria-label`. Toggle buttons get `aria-pressed`.
  Live regions get `role="alert"` (errors) or `role="status"` (success).
- Focus-visible styling stays globally enabled in `globals.css`.
- Color contrast targets ≥ 4.5:1 (normal text) and ≥ 3:1 (large text and
  UI components). The Volt purple `volt-600` is the safe accent on white.
- All interactive elements reachable via Tab; Enter/Space activate buttons;
  Escape closes overlays.
- `<html lang>` reflects the current i18n language.
- Run a Lighthouse + axe pass before any release; fix new AA issues before
  shipping the feature that introduced them.

**Forbidden**: replacing semantic elements with styled divs; removing focus
outlines; using color alone to convey meaning; introducing animations
without `prefers-reduced-motion` respect.

### 5. SSO via OIDC for members and supporters

Authentication runs over OIDC against the Volt-hosted Authentik
instance. **Never SAML** — and never a managed-platform auth product
either; this project's auth is fully owned by Volt.

**Implications**:
- Volt Auth (Authentik) is the OIDC issuer; the login UI shows it as
  "Continue with Volt Auth". The handshake lives in
  `app/api/auth/callback` and `lib/auth/oidc.ts`.
- Sessions are signed JWT cookies (jose) — see `lib/auth/session.ts`.
  Storage of identity is `public.profiles` keyed by `oidc_sub`.
- Email/password is a fallback only. If V1 goes SSO-only, hide the
  email/password form rather than removing the route handlers — keeps
  ops/admin recovery options.
- The public layer is the automatic extension of the SSO-gated member
  search: same data, same Postgres rows, RLS-filtered.
- New auth needs (e.g. SCIM provisioning) extend OIDC and the
  hand-rolled session layer, never substitute them.

**Forbidden**: introducing SAML; introducing a managed-platform auth
product (no Supabase Auth, no Auth0, no Clerk); storing passwords or
tokens anywhere outside Postgres + the signed session cookie.

### 6. Compliance, privacy and auditability (placeholder — to be tightened)

> **Status**: placeholder. The exact obligations for Volt are still being
> determined (legal review pending). Treat the bullets below as the floor,
> not the ceiling. When Volt's privacy/legal team finalizes requirements,
> replace this section and surface any conflicts with existing code.

**Provisional implications**:
- **GDPR**: every table that stores user-attributed content has an
  `author_id uuid references profiles(id) on delete set null` plus an
  `author_name_cached text` column. Deleting a profile must offer the
  admin a choice: *keep name* or *anonymize*. Content rows are never
  destroyed by user deletion — only the FK is nulled / the cached name
  scrubbed. The `deleteUserGdpr` server action in
  `app/(app)/documents/actions.ts` is the canonical implementation.
- **EU Data Act / portability**: every document must remain exportable in
  a vendor-neutral format (`.md`, `.html`, `.docx`) via
  `/api/documents/[id]/export`. Programmatic access goes through the
  typed `/api/*` JSON endpoints; SQL-direct access via psql remains
  available for ops. Don't add features that store data only reachable
  via a proprietary UI.
- **Audit log**: schema-level table `audit_log` exists. Every privileged
  action (role change, status transition to/from `approved`, GDPR
  deletion, group permission change, bulk export, AI call on a non-public
  document) should write a row. Admin-only RLS read.
- **AI usage controls**: external AI calls (Anthropic, DeepL,
  LanguageTool) only happen on explicit user action — never auto-trigger
  on document save. Calls on `draft` or `review` documents must respect
  the document's RLS visibility (don't ship draft text to a third party
  the document's own readers can't see). Rate-limit per-user when keys
  are configured.
- **Data residency**: the Hetzner VPS is pinned to an EU region
  (Falkenstein/Nuremberg). Don't add a region replica outside the EU
  without explicit sign-off.
- **Secrets**: API keys live in environment variables, never in the
  database, never in `git`. `.env.local` is in `.gitignore`.

**Forbidden until legal sign-off**: shipping document content to AI
providers without an opt-in flag; cross-region replication outside the
EU; building features that bypass the audit log for privileged actions;
introducing analytics/tracking that fingerprints anonymous library
visitors.

### 7. Strict EU jurisdiction + self-hosted-first

Every vendor in the production stack must be an EU-incorporated company,
running on EU infrastructure. Where a vendor exists in open-source form,
we self-host it on Volt-controlled EU infrastructure rather than using the
SaaS version. Cost minimization is a tie-breaker, not a top priority.

**Production stack of record**:
- **Compute / hosting**: Hetzner Cloud (Germany), single VPS running
  Docker Compose (`deploy/docker-compose.yml`).
- **Database**: self-hosted Postgres 17 in the same compose. Data on
  the `pg_data` volume; nightly dumps to Hetzner Storage Box.
- **Auth (identity provider)**: self-hosted Authentik on the same VPS
  (or a Volt-shared instance). OIDC issuer for this app.
- **Auth (session layer)**: signed JWT cookies via `jose`, code in
  `lib/auth/*`. No third-party auth SaaS.
- **Realtime collab**: self-hosted Hocuspocus (Y.js websocket server)
  in `deploy/hocuspocus/`.
- **Email/SMTP**: Brevo (France) for transactional auth + notification
  mails. Free tier covers expected volume.
- **LLM (drafting)**: Mistral AI (France) via La Plateforme. Self-
  hosted fallback via Ollama on the same VPS if budget requires zero
  spend.
- **Translation**: DeepL (Germany) with own API key.
- **Grammar / language check**: LanguageTool self-hosted (German
  project, Docker container in the same compose).
- **CEFR analysis**: in-process (`lib/cefr.ts`); upgradeable to a
  self-hosted Python micro-service.
- **DNS**: deSEC (Germany) — free, DNSSEC-aware.
- **Domain registrar**: TransIP (Netherlands) or other EU registrar.
- **CDN (optional)**: Bunny.net (Slovenia).
- **Object storage / backup**: Hetzner Storage Box (Germany).
- **Analytics (optional)**: self-hosted Plausible (Estonian project).
- **Error monitoring (optional)**: self-hosted GlitchTip (open source).

**Forbidden**: any vendor headquartered outside the EU, including for
features behind a paywall; relying on US-based DNS, registrar, CDN, or
auth provider; routing data through US-incorporated companies even when
the data centre is in the EU (CLOUD Act exposure); introducing a SaaS
dependency that is not also available as a self-hostable open-source
release.

**Allowed exceptions** (must be flagged in code comments and reviewed
quarterly):
- Open-source software whose vendor is non-EU but is run on Volt-owned
  EU infrastructure (e.g. Mattermost, Element).
- Volt-internal services hosted by partner organizations elsewhere in
  Europe under a documented Data Processing Agreement.

## Project layout (orientation for future changes)

```
app/                     # Next.js App Router
  (app)/                 # auth-gated area: dashboard, documents, admin, settings
  library/               # public, RLS-filtered to approved docs
  help/                  # public help center
  api/                   # route handlers (export, translate, ai, scim, lang, import)
  auth/                  # OIDC callback + signout
components/              # client components: editor, comments, AI panel, nav
lib/
  auth/                  # OIDC client + signed-cookie session layer
  db/                    # postgres-js pool + PostgREST-shape shim
  i18n/                  # dictionaries + getT() server helper
  sanitize.ts, markdown.ts, diff.ts, cefr.ts, scim.ts, types.ts
middleware.ts            # session refresh + auth gating for (app)/*
db/migrations/           # SQL migrations applied in order via psql
deploy/                  # docker-compose, Caddyfile, Hocuspocus, Brevo templates
```

## Database conventions

- Every user-data table has RLS enabled.
- Cross-table policies go through `SECURITY DEFINER` helpers to avoid
  recursion.
- Author identity in audit-relevant rows is `author_id` (FK with
  `ON DELETE SET NULL`) **plus** `author_name_cached` for GDPR-aware
  retention. Never delete content rows when a user is removed; null out
  the FK and optionally anonymize the cached name.
- Versions are immutable. Restore = create a new version, never overwrite.

## Required environment variables

Always:
- `DATABASE_URL` — `postgres://user:pass@host:5432/dbname` pointing at
  the self-hosted Postgres.
- `SESSION_COOKIE_SECRET` — secret for signing the JWT session cookie
  (rotate on incident).
- `NEXT_PUBLIC_APP_URL` — public origin, used to build the OIDC
  redirect URI.

OIDC (Authentik):
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `OIDC_REDIRECT_URI`.

Optional, feature-gated:
- `DEEPL_API_KEY` — real machine translation (else: stub returns source).
- `MISTRAL_API_KEY` — AI drafting via La Plateforme (else: stub).
- `BREVO_SMTP_HOST` / `_PORT` / `_USER` / `_PASS` — transactional mail.
- `SCIM_TOKEN` — bearer token for `/api/scim/v2/*`.

There are no Supabase env vars. If you see `NEXT_PUBLIC_SUPABASE_*`
or `SUPABASE_SERVICE_ROLE_KEY` in any env file, that's a regression
from the no-Supabase principle — strip them.

## When in doubt

Default to the principle that protects user data and access integrity:
**single source of truth + WCAG + OIDC + public-by-status are non-negotiable.**
Adaptability (#1) means we can extend, but extensions live around these
principles, not through them.
