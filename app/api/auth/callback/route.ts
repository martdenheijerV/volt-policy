import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/auth/oidc";
import { signSession } from "@/lib/auth/session";
import { getCookieConfig } from "@/lib/auth/config";
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OIDC exchange failed" },
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

  return NextResponse.redirect(new URL(next, url));
}
