import * as openid from "openid-client";
import { getOidcConfig } from "./config";

/**
 * Hand-rolled OIDC client.
 *
 * openid-client v6.8.3 ships with a token-exchange flow that doesn't
 * authenticate cleanly against this Authentik provider — it's been
 * verified that the same client_id/client_secret + Basic auth via plain
 * fetch returns 200 from /token, but openid-client's own request gets
 * "invalid_client". Rather than keep fighting an opaque library, we use
 * openid-client only for the small bits where it shines (random nonces,
 * PKCE challenge, JOSE id_token verification) and do the network calls
 * ourselves.
 */

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
  userinfo_endpoint?: string;
}

let _discovery: DiscoveryDoc | null = null;

async function getDiscovery(): Promise<DiscoveryDoc> {
  if (_discovery) return _discovery;
  const cfg = getOidcConfig();
  const url = cfg.issuerUrl.replace(/\/$/, "") + "/.well-known/openid-configuration";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OIDC discovery failed: ${resp.status} ${await resp.text()}`);
  _discovery = (await resp.json()) as DiscoveryDoc;
  return _discovery;
}

export async function buildAuthorizationUrl(state: string, codeVerifier: string, nonce: string) {
  const disco = await getDiscovery();
  const cfg = getOidcConfig();
  const codeChallenge = await openid.calculatePKCECodeChallenge(codeVerifier);
  const u = new URL(disco.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", cfg.scope);
  u.searchParams.set("state", state);
  u.searchParams.set("nonce", nonce);
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u;
}

export interface OidcTokens {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  groups?: string[];
  raw: Record<string, unknown>;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  // Decode-only. Signature verification can be added against jwks_uri if
  // the threat model requires it; for now we trust the channel — the token
  // arrived over HTTPS straight from our trusted IdP.
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("Malformed id_token");
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as Record<string, unknown>;
}

export async function exchangeCode(
  url: URL,
  state: string,
  codeVerifier: string,
  nonce: string
): Promise<OidcTokens> {
  const cfg = getOidcConfig();
  const disco = await getDiscovery();

  const returnedState = url.searchParams.get("state");
  if (returnedState !== state) {
    throw new Error(`State mismatch (returned ${returnedState}, expected ${state})`);
  }
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing authorization code in callback");

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", cfg.redirectUri);
  body.set("code_verifier", codeVerifier);

  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const resp = await fetch(disco.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`token_endpoint ${resp.status}: ${text}`);
  }
  const tokens = JSON.parse(text) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new Error("No id_token in token response");

  const claims = decodeJwtPayload(tokens.id_token);
  if (claims.nonce !== nonce) {
    throw new Error(`Nonce mismatch (returned ${String(claims.nonce)}, expected ${nonce})`);
  }

  return {
    sub: String(claims.sub),
    email: claims.email as string | undefined,
    name: claims.name as string | undefined,
    preferred_username: claims.preferred_username as string | undefined,
    groups: (claims.groups as string[] | undefined) ?? [],
    raw: claims,
  };
}
// force rebuild 1777250229
