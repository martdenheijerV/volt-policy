import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as openid from "openid-client";
import { buildAuthorizationUrl } from "@/lib/auth/oidc";

export async function GET(request: Request) {
  try {
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
  } catch (e) {
    // Log the FULL error so we can debug what openid-client is rejecting.
    console.error("=== /api/auth/login error ===");
    console.error("name:", e instanceof Error ? e.name : typeof e);
    console.error("message:", e instanceof Error ? e.message : String(e));
    console.error("stack:", e instanceof Error ? e.stack : "(no stack)");
    if (e && typeof e === "object") {
      for (const key of Object.keys(e as Record<string, unknown>)) {
        try {
          console.error(`prop ${key}:`, JSON.stringify((e as Record<string, unknown>)[key]));
        } catch {
          console.error(`prop ${key}: (unserialisable)`);
        }
      }
    }
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        name: e instanceof Error ? e.name : undefined,
        cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
      },
      { status: 500 }
    );
  }
}
