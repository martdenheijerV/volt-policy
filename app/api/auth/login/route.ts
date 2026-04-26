import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as openid from "openid-client";
import { buildAuthorizationUrl } from "@/lib/auth/oidc";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/dashboard";

  const state = openid.randomState();
  const nonce = openid.randomNonce();
  const codeVerifier = openid.randomPKCECodeVerifier();

  const cookieStore = await cookies();
  cookieStore.set("oidc_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  cookieStore.set("oidc_nonce", nonce, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  cookieStore.set("oidc_verifier", codeVerifier, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  cookieStore.set("oidc_next", next, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });

  const redirectUrl = await buildAuthorizationUrl(state, codeVerifier, nonce);
  return NextResponse.redirect(redirectUrl);
}
