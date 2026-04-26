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
5. Generate an SMTP key under *Senders & IP → SMTP* and put it in Supabase
   Auth's SMTP settings.

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

## Supabase Auth integration

Supabase Auth doesn't render Brevo templates directly — it sends raw
emails through SMTP. So:

- **Confirm signup** + **password reset**: configure in Supabase Studio
  *Authentication → Email Templates*, paste the HTML body inline.
- **Comment notification** + **status change**: triggered from server
  actions, calling `transac_templates_send_transac_email` via the Brevo
  MCP (or REST API directly).
