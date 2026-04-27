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

  // Upsert profile.
  //
  // Three cases to handle:
  //   A. We've seen this oidc_sub before → just update the cached name.
  //   B. We haven't seen oidc_sub, but an admin pre-created a row keyed on
  //      email (the "Add external user" flow). Match by lowercased email
  //      and link the oidc_sub onto that row, preserving the pre-set role.
  //   C. Fully new user → insert with default role 'member' (or 'admin' if
  //      the IdP put them in the volt-policy-admin group).
  const sql = getSql();
  void sql;
  const realName = claims.name ?? claims.preferred_username ?? claims.email ?? null;
  const fullName = realName ?? claims.sub;
  const emailLower = claims.email ? claims.email.toLowerCase() : null;
  const isAdminGroup = (claims.groups ?? []).includes("volt-policy-admin");
  const result = await withUser(null, async (tx) => {
    // Make sure the email column exists — older deployments may not have it.
    await tx`alter table profiles add column if not exists email text`;

    // Case A: existing oidc_sub.
    const existing = await tx<{ id: string; full_name: string; role: string }[]>`
      select id, full_name, role from profiles where oidc_sub = ${claims.sub}
    `;
    if (existing.length > 0) {
      await tx`
        update profiles
        set full_name = coalesce(${realName}, full_name),
            email = coalesce(${emailLower}, email)
        where oidc_sub = ${claims.sub}
      `;
      return existing;
    }

    // Case B: pre-created profile keyed on email.
    if (emailLower) {
      const linked = await tx<{ id: string; full_name: string; role: string }[]>`
        update profiles
        set oidc_sub = ${claims.sub},
            full_name = coalesce(${realName}, full_name),
            email = ${emailLower}
        where email = ${emailLower} and oidc_sub is null
        returning id, full_name, role
      `;
      if (linked.length > 0) return linked;
    }

    // Case C: fresh insert.
    return await tx<{ id: string; full_name: string; role: string }[]>`
      insert into profiles (id, oidc_sub, full_name, email, role)
      values (
        gen_random_uuid(),
        ${claims.sub},
        ${fullName},
        ${emailLower},
        ${isAdminGroup ? "admin" : "member"}
      )
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
