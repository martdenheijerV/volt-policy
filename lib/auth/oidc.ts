import * as openid from "openid-client";
import { getOidcConfig } from "./config";

let _config: openid.Configuration | null = null;

export async function getOpenIdConfig(): Promise<openid.Configuration> {
  if (_config) return _config;
  const cfg = getOidcConfig();
  // openid-client v6 default `ClientSecretPost` was rejected by Authentik
  // ("invalid_client" — auth header missing). Pass `ClientSecretBasic`
  // directly (NOT invoked) so v6 wires up HTTP Basic correctly.
  _config = await openid.discovery(
    new URL(cfg.issuerUrl),
    cfg.clientId,
    cfg.clientSecret,
    openid.ClientSecretBasic
  );
  return _config;
}

export async function buildAuthorizationUrl(state: string, codeVerifier: string, nonce: string) {
  const config = await getOpenIdConfig();
  const cfg = getOidcConfig();
  const codeChallenge = await openid.calculatePKCECodeChallenge(codeVerifier);
  return openid.buildAuthorizationUrl(config, {
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
}

export interface OidcTokens {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  groups?: string[];
  raw: Record<string, unknown>;
}

export async function exchangeCode(
  url: URL,
  state: string,
  codeVerifier: string,
  nonce: string
): Promise<OidcTokens> {
  const config = await getOpenIdConfig();
  const tokens = await openid.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
    expectedNonce: nonce,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("No ID token claims");
  return {
    sub: String(claims.sub),
    email: claims.email as string | undefined,
    name: claims.name as string | undefined,
    preferred_username: claims.preferred_username as string | undefined,
    groups: (claims.groups as string[] | undefined) ?? [],
    raw: claims as Record<string, unknown>,
  };
}
