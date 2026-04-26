/**
 * OIDC + session configuration. All env-driven.
 *
 * Production envs (set via Coolify or .env.production):
 *   OIDC_ISSUER_URL=https://auth.volteuropa.org/realms/volt
 *   OIDC_CLIENT_ID=volt-policy
 *   OIDC_CLIENT_SECRET=<from Volt Auth>
 *   OIDC_REDIRECT_URI=https://policy.volteuropa.org/api/auth/callback
 *   COOKIE_SECRET=<32-byte base64 random>
 *   COOKIE_NAME=volt_session
 */

export function getOidcConfig() {
  return {
    issuerUrl: required("OIDC_ISSUER_URL"),
    clientId: required("OIDC_CLIENT_ID"),
    clientSecret: required("OIDC_CLIENT_SECRET"),
    redirectUri: required("OIDC_REDIRECT_URI"),
    scope: process.env.OIDC_SCOPE ?? "openid profile email",
  };
}

export function getCookieConfig() {
  return {
    name: process.env.COOKIE_NAME ?? "volt_session",
    secret: required("COOKIE_SECRET"),
    maxAge: 60 * 60 * 8, // 8 hours
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    // In dev without OIDC configured, return a harmless placeholder so pages
    // don't crash on import. Real auth flows will fail with a clear message.
    if (process.env.NODE_ENV !== "production") return `__${name}_NOT_SET__`;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}
