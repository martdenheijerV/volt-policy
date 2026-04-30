# Brevo email templates for Volt Policy

Drop these into a Volt-owned Brevo account once it's created.

## Why a separate account

The Brevo MCP currently in this Cowork session is connected to a personal
account (`sofieverbindt.nl`). For production, Volt should:

1. Sign up at https://brevo.com with a Volt org email.
2. Verify the `volteuropa.org` domain (DNS records via deSEC).
3. Create a sender like `policy@volteuropa.org`.
4. Re-connect the Brevo MCP to that account (or just paste the templates
   below into the Brevo dashboard manually).
5. Generate an SMTP key under *Senders & IP → SMTP* and put it in the
   `BREVO_SMTP_*` env vars on the VPS so the OIDC callback flow and
   the transactional notifier (`lib/email.ts`) can send through it.

## Templates

### 1. Confirm signup

- **Name**: `volt-policy-confirm-signup`
- **Subject**: `Confirm your Volt Policy account`
- **Sender**: `policy@volteuropa.org` (display: "Volt Policy")
- **HTML**: `confirm-signup.html`

### 2. Password reset

- **Name**: `volt-policy-password-reset`
- **Subject**: `Reset your Volt Policy password`
- **HTML**: `password-reset.html`

### 3. New comment notification

- **Name**: `volt-policy-comment-notification`
- **Subject**: `{{params.commenter}} commented on {{params.docTitle}}`
- **HTML**: `comment-notification.html`

### 4. Status change (e.g. moved to review)

- **Name**: `volt-policy-status-change`
- **Subject**: `"{{params.docTitle}}" is now {{params.status}}`
- **HTML**: `status-change.html`

## How the templates are wired up

Authentication runs over OIDC (Authentik), so signup-confirmation and
password-reset emails are sent by the identity provider, not by this
app. We point those at Brevo SMTP via Authentik's email settings.

- **Confirm signup** + **password reset**: configured inside Authentik
  (Identity → Email Templates), pointed at Brevo SMTP.
- **Comment notification** + **status change**: triggered from server
  actions in this app via `lib/email.ts`, which calls the Brevo
  transactional API directly.
