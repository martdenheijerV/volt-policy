"use client";

/**
 * Browser-side auth helpers.
 *
 * Sessions live in an httpOnly JWT cookie (set by /api/auth/callback) so the
 * browser cannot read or forge them — it asks /api/auth/me which trusts the
 * cookie. Sign-out posts to /api/auth/signout which deletes the cookie.
 */

export interface BrowserUser {
  id: string;
  email: string | null;
  name: string | null;
}

export async function getBrowserUser(): Promise<BrowserUser | null> {
  try {
    const res = await fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { user: BrowserUser | null };
    return json.user;
  } catch {
    return null;
  }
}

export async function signOutFromBrowser(redirectTo: string = "/"): Promise<void> {
  await fetch("/api/auth/signout", {
    method: "POST",
    credentials: "same-origin",
  });
  if (typeof window !== "undefined") {
    window.location.href = redirectTo;
  }
}
