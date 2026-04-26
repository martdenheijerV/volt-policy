# Live deploy — Hetzner + Coolify + self-hosted Postgres + Authentik

Target: a fully EU-jurisdiction stack running on a single Hetzner Cloud VPS,
matching the principles in `CLAUDE.md`. **Zero US-incorporated dependencies.**

Estimated effort once the Hetzner account exists: **~2 hours**.
Estimated monthly cost: **~€12–17**.

## Architecture

```
            ┌────────────────────────────────────────────────────┐
            │ Hetzner CX32 VPS (Falkenstein, Germany)            │
            │                                                    │
            │  Caddy (LE certs)                                  │
            │   ├─→ policy.volteuropa.org    → Next.js app       │
            │   ├─→ auth.policy.…            → Authentik (OIDC)  │
            │   ├─→ realtime.policy.…        → HocusPocus (Yjs)  │
            │   └─→ languagetool.policy.…    → LanguageTool      │
            │                                                    │
            │  Postgres 17 (single source of truth)              │
            │  Authentik OIDC provider (German project)          │
            │  HocusPocus Yjs collab server                      │
            │  LanguageTool grammar service                      │
            │                                                    │
            └────────────────────────────────────────────────────┘
                              │
                Hetzner Storage Box (encrypted nightly backups)

External, EU-only services:
  - Brevo (FR) for transactional email (auth flows from Authentik)
  - Mistral AI (FR) for AI drafting
  - DeepL (DE) for translation
  - deSEC (DE) for DNS
  - TransIP (NL) for domain registration
```

## 1. Provision the VPS

1. Create a Hetzner Cloud account at https://www.hetzner.com/cloud (creditcard required).
2. **Create new server**:
   - Location: `Falkenstein` or `Nuremberg` (both Germany).
   - Image: `Ubuntu 24.04 LTS`.
   - Type: `CX32` (4 vCPU, 8 GB RAM, 80 GB SSD) — €7.59/mo.
   - Add your SSH public key.
   - Networking: enable IPv6, IPv4 included.
   - Firewall: create one allowing TCP 22, 80, 443 only.
3. Note the public IP. SSH in:
   ```bash
   ssh root@<vps-ip>
   ```
4. Create an unprivileged user:
   ```bash
   adduser volt
   usermod -aG sudo volt
   rsync --archive --chown=volt:volt ~/.ssh /home/volt
   ```

## 2. Install Coolify

Coolify is the open-source PaaS that runs the docker workloads.

```bash
ssh volt@<vps-ip>
sudo apt update && sudo apt -y upgrade
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

When done, open `http://<vps-ip>:8000` in your browser. Create the admin
user. Switch to your domain later.

## 3. Domain + DNS

1. Buy a domain at **TransIP** (NL) — `.eu` or `.org` recommended.
2. In TransIP DNS settings, point nameservers to **deSEC**:
   - Sign up at https://desec.io (free, German-hosted, DNSSEC).
   - Add the domain, copy the deSEC nameservers, paste them in TransIP.
3. In deSEC, add A records:
   - `policy` → `<vps-ip>`
   - `auth.policy` → `<vps-ip>`
   - `realtime.policy` → `<vps-ip>`

## 4. Self-host Postgres + Authentik

### Postgres 17

In Coolify:
- **+ New Resource → Database → Postgres 17**
- Set a strong password — note it.
- Note the connection string (`postgres://postgres:<pwd>@<host>:5432/postgres`)
  for the `DATABASE_URL` env var the app needs.

### Authentik (OIDC provider)

If your organisation already runs Volt Auth somewhere, **skip this section
and point `OIDC_ISSUER_URL` at the existing realm**.

Otherwise, install Authentik (open-source, German project) in Coolify:

- **+ New Resource → Service → Authentik** (template available).
- Domain: `auth.policy.volteuropa.org`
- Bootstrap admin: `ops@volteuropa.org`
- After it boots, log in as the bootstrap admin and:
  1. Create an OAuth2/OpenID provider:
     - Name: `volt-policy`
     - Client type: `Confidential`
     - Redirect URIs:
       `https://policy.volteuropa.org/api/auth/callback`
     - Signing key: pick an existing one or create a new one.
     - Scopes: `openid`, `profile`, `email`, `groups` (groups optional).
  2. Wrap the provider in an Application; assign it to the right group of
     members so only Volt people can log in.
  3. Note the **client ID** and **client secret** for the env vars below.

## 5. Apply the schema

Connect to the new Postgres instance and apply the migrations:

```bash
psql "postgres://postgres:<pwd>@<vps-ip>:5432/postgres"

# In order:
\i 001_init_policy_schema.sql
\i 002_first_user_is_admin.sql
\i 003_fix_rls_recursion.sql
\i 004_extended_schema.sql
\i 005_eu_pure_auth.sql   # this one is required for the EU-pure stack
```

The `005_eu_pure_auth.sql` migration drops the `auth.users` linkage,
introduces `profiles.oidc_sub`, replaces every `auth.uid()` reference with
the `current_user_id()` / `current_user_role_setting()` helpers, and
re-creates all RLS policies on top of those helpers.

## 6. Deploy the app via Coolify

In Coolify → **+ New Resource → Application → Public Repository**:

1. Repository URL: your fork of this repo.
2. Branch: `main`.
3. Build pack: `Dockerfile` (Coolify auto-detects).
4. Domain: `policy.volteuropa.org`.
5. Environment variables: copy from `deploy/.env.production.example`.
   - Critical:
     - `DATABASE_URL=postgres://postgres:<pwd>@<host>:5432/postgres`
     - `OIDC_ISSUER_URL=https://auth.policy.volteuropa.org/application/o/volt-policy/`
     - `OIDC_CLIENT_ID=volt-policy`
     - `OIDC_CLIENT_SECRET=<from step 4>`
     - `OIDC_REDIRECT_URI=https://policy.volteuropa.org/api/auth/callback`
     - `OIDC_SCOPE=openid profile email`
     - `COOKIE_SECRET=<base64 of 32 random bytes>` — generate with
       `openssl rand -base64 32`.
     - `COOKIE_NAME=volt_session`
     - `MISTRAL_API_KEY=<from https://console.mistral.ai>`
     - `DEEPL_API_KEY=<from https://www.deepl.com/pro>`
     - `LANGUAGETOOL_URL=http://languagetool:8010/v2/check`
     - `NEXT_PUBLIC_HOCUSPOCUS_URL=wss://realtime.policy.volteuropa.org`
     - `HOCUS_SECRET=<random>` (also set on HocusPocus service)
     - `SCIM_TOKEN=<random>` (only if Volt Auth will SCIM-sync members in)

6. Click **Deploy**.

## 7. Brevo email (transactional)

1. Sign up at https://brevo.com (French — Sendinblue rebrand).
2. Verify your sending domain (`volteuropa.org`) by adding TXT records in
   deSEC (Brevo provides them).
3. Create an SMTP key under *Senders & IP → SMTP*.
4. In Authentik admin, configure the system SMTP under *System → Settings*:
   host `smtp-relay.brevo.com`, port `587`, user, key. Test send.
5. Email templates can be created via the Brevo MCP in this workspace —
   say *"create a transactional template for password reset using Brevo MCP"*
   and Claude will use the connector.

## 8. LanguageTool + HocusPocus

In Coolify, two more services from this repo's `deploy/` folder:

- **LanguageTool**: image `erikvl87/languagetool:latest`, expose port
  `8010`, internal-only.
- **HocusPocus**: build from `deploy/hocuspocus/Dockerfile`. Set
  `DATABASE_URL` to the Postgres URL, set `HOCUS_SECRET`. Domain:
  `realtime.policy.volteuropa.org` with WebSocket support.

## 9. Volt Auth (SSO over OIDC)

Already wired in step 4/6 — there is no separate SSO setup beyond pointing
`OIDC_ISSUER_URL`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` at Volt Auth or your
local Authentik. Sign-in goes through `/api/auth/login`, the IdP redirects
to `/api/auth/callback`, and the app upserts `profiles` keyed by
`oidc_sub`.

If you provision via SCIM, point your IdP at:

```
https://policy.volteuropa.org/api/scim/v2/Users
Authorization: Bearer <SCIM_TOKEN>
```

The endpoint upserts profiles by `externalId` (= `oidc_sub`).

## 10. Backups

Hetzner Storage Box at €3.49/mo for 1 TB:

```bash
# /etc/cron.daily/volt-backup
#!/bin/sh
set -eu
ts=$(date +%F)
pg_dump --no-owner --no-acl postgres://postgres:<pwd>@localhost:5432/postgres \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file /root/.backup_pass \
  > /tmp/volt-$ts.sql.gpg
rsync -avz /tmp/volt-$ts.sql.gpg u123@u123.your-storagebox.de:/backups/
rm /tmp/volt-$ts.sql.gpg
find /backups/ -mtime +90 -delete  # 90-day retention
```

## 11. Monitoring (optional)

- **GlitchTip** (open source Sentry alternative) as a Coolify service.
  Connect via `SENTRY_DSN` env var (drop-in compatible).
- **Plausible** (Estonia) for privacy-friendly analytics — Coolify template.
- Hetzner's built-in basic monitoring (CPU/RAM/disk graphs) is free.

## 12. Smoke test checklist

- [ ] `https://policy.volteuropa.org` loads the landing page in Ubuntu font.
- [ ] "Continue with Volt Auth" button redirects to Authentik / Volt Auth.
- [ ] Sign in via Volt Auth → lands on `/dashboard`.
- [ ] Create a document, save 2 versions, see version history + diff.
- [ ] Comment with anchor → highlight + jump-to-text works.
- [ ] Approve a document → it appears at `/library/<slug>` in incognito.
- [ ] Translate a document to NL with DeepL → status `machine` → `verified`.
- [ ] Export `.md`, `.html`, `.docx` — all download cleanly.
- [ ] Print preview hides nav and comments.
- [ ] Admin user-delete with anonymize → comments stay, name becomes
      "Anonymous".
- [ ] AI panel: Find similar / Check grammar / Analyze CEFR all return
      results.
- [ ] Anonymous `curl https://policy.volteuropa.org/library/<slug>` returns
      the approved document HTML (EU Data Act compliance check).

## 13. Hand-over

Once the smoke test passes, share with a small group of Volt members. Tag
the commit `v1.0.0`. Done.
