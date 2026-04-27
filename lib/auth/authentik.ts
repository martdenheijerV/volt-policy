import { randomBytes } from "crypto";

/**
 * Thin helper around the Authentik REST API. Used by the admin "Add external
 * user" flow so admins can onboard guests without leaving the Volt Policy
 * app or touching Authentik themselves.
 *
 * Requires two env vars on the running app:
 *   - OIDC_ISSUER_URL  (used to derive the Authentik base URL)
 *   - AUTHENTIK_API_TOKEN  (long-lived token created in Authentik)
 */

function authentikBaseUrl(): string {
  const issuer = process.env.OIDC_ISSUER_URL;
  if (!issuer) throw new Error("OIDC_ISSUER_URL not configured");
  // issuer looks like: https://auth.policy.voltmaastricht.nl/application/o/volt-policy/
  // We want:           https://auth.policy.voltmaastricht.nl
  const u = new URL(issuer);
  return `${u.protocol}//${u.host}`;
}

function apiToken(): string {
  const token = process.env.AUTHENTIK_API_TOKEN;
  if (!token) {
    throw new Error(
      "AUTHENTIK_API_TOKEN not set. Generate one in Authentik (Directory → Tokens) and add it to the app env vars."
    );
  }
  return token;
}

async function authentikFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = authentikBaseUrl();
  const url = `${base}/api/v3${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export interface CreateExternalUserResult {
  ok: boolean;
  username?: string;
  tempPassword?: string;
  authentikUserPk?: number;
  error?: string;
}

/**
 * Create an external user in Authentik and return one-time credentials.
 * The caller is responsible for sharing the URL + credentials with the
 * external person. The temp password is shown only once — it isn't stored.
 */
export async function createAuthentikUser(input: {
  name: string;
  email: string;
}): Promise<CreateExternalUserResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanName = input.name.trim();
  if (!cleanEmail || !cleanName) {
    return { ok: false, error: "Name and email are required." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return { ok: false, error: "Email looks invalid." };
  }

  // Username = local part of email (lowercased, dots kept). If a duplicate
  // exists, suffix with -2, -3, …
  const baseUsername = cleanEmail.split("@")[0].replace(/[^a-z0-9._-]/g, "");
  let username = baseUsername;
  let suffix = 1;
  while (await authentikUsernameExists(username)) {
    suffix++;
    username = `${baseUsername}-${suffix}`;
    if (suffix > 50) {
      return { ok: false, error: "Could not find a free username." };
    }
  }

  // Strong temp password — admin shares it once, user changes it on first
  // login (Authentik default flow prompts for change on first set).
  const tempPassword = randomBytes(15).toString("base64url");

  // 1. Create the user
  const createRes = await authentikFetch("/core/users/", {
    method: "POST",
    body: JSON.stringify({
      username,
      name: cleanName,
      email: cleanEmail,
      type: "internal",
      is_active: true,
      groups: [],
    }),
  });
  if (!createRes.ok) {
    return {
      ok: false,
      error: `Authentik user create failed: ${createRes.status} ${await createRes.text()}`,
    };
  }
  const userJson = (await createRes.json()) as { pk: number; username: string };

  // 2. Set the temp password
  const pwRes = await authentikFetch(`/core/users/${userJson.pk}/set_password/`, {
    method: "POST",
    body: JSON.stringify({ password: tempPassword }),
  });
  if (!pwRes.ok) {
    return {
      ok: false,
      error: `Authentik set_password failed: ${pwRes.status} ${await pwRes.text()}`,
    };
  }

  return {
    ok: true,
    username: userJson.username,
    tempPassword,
    authentikUserPk: userJson.pk,
  };
}

async function authentikUsernameExists(username: string): Promise<boolean> {
  const res = await authentikFetch(`/core/users/?username=${encodeURIComponent(username)}`);
  if (!res.ok) return false;
  const data = (await res.json()) as { results?: unknown[] };
  return Array.isArray(data.results) && data.results.length > 0;
}
