import { NextResponse } from "next/server";

/**
 * Deprecated path — legacy OAuth callback URL. The current callback
 * lives at /api/auth/callback. Any stale redirect URL configured
 * against this path is forwarded with the OIDC handshake parameters
 * preserved so existing identity-provider configurations keep working.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/auth/callback", url);
  url.searchParams.forEach((value, key) => {
    if (key !== "next") target.searchParams.set(key, value);
  });
  const next = url.searchParams.get("next");
  if (next) target.searchParams.set("next", next);
  return NextResponse.redirect(target);
}
