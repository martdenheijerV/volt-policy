import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/auth/oidc";
import { signSession } from "@/lib/auth/session";
import { getCookieConfig, getOidcConfig } from "@/lib/auth/config";
import { getSql, withUser } from "@/lib/db/sql";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();

  const state = cookieStore.get("oidc_state")?.value ?? "";
  const nonce = cookieStore.get("oidc_nonce")?.value ?? "";
  const codeVerifier = cookieStore.get("oidc_verifier")?.value ?? "";
  const next = cookieStore.get("oidc_next")?.value ?? "/dashboard";

  if (!state || !codeVerifier) {
    return NextResponse.json({ error: "Missing OIDC handshake cookies" }, { status: 400 });
  }

  let claims;
  try {
    claims = await exchangeCode(url, state, codeVerifier, nonce);
  } catch (e) {
    // Surface the FULL error so we can diagnose token-exchange failures.
    console.error("=== /api/auth/callback exchange error ===");
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
        error: e instanceof Error ? e.message : "OIDC exchange failed",
        name: e instanceof Error ? e.name : undefined,
        cause: e instanceof Error && e.cause ? String(e.cause) : undefined,
      },
      { status: 400 }
    );
  }

  // Upsert profile by oidc sub
  const sql = getSql();
  const fullName = claims.name ?? claims.preferred_username ?? claims.email ?? claims.sub;
  const isAdmin = (claims.groups ?? []).includes("volt-policy-admin");
  const result = await withUser(null, async (tx) => {
    return await tx`
      insert into profiles (id, oidc_sub, full_name, role)
      values (gen_random_uuid(), ${claims.sub}, ${fullName}, ${isAdmin ? "admin" : "member"})
      on conflict (oidc_sub) do update set full_name = excluded.full_name
      returning id, full_name, role
    `;
  });
  const profileId = (result[0] as { id: string }).id;

  // Issue session cookie
  const sessionToken = await signSession({
    userId: profileId,
    email: claims.email,
    name: fullName,
  });
  const cfg = getCookieConfig();
  cookieStore.set(cfg.name, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: cfg.maxAge,
  });

  // Cleanup transient OIDC cookies
  cookieStore.delete("oidc_state");
  cookieStore.delete("oidc_nonce");
  cookieStore.delete("oidc_verifier");
  cookieStore.delete("oidc_next");

  // Use the configured redirect URI's origin (the public domain) instead of
  // request.url, which behind the Traefik proxy resolves to the internal
  // hostname (0.0.0.0:3000) and breaks the browser redirect.
  const baseOrigin = new URL(getOidcConfig().redirectUri).origin;
  return NextResponse.redirect(new URL(next, baseOrigin));
}
