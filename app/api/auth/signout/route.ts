import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieConfig } from "@/lib/auth/config";
import { buildEndSessionUrl } from "@/lib/auth/oidc";

/**
 * Sign out flow:
 *
 *  1. Clear our local session cookie. From this point our middleware
 *     treats the user as anonymous.
 *
 *  2. Redirect the browser to Authentik's `end_session_endpoint` so the
 *     user's IdP session is also killed. Without this step, clicking
 *     "Sign in with Volt Auth" on the login page would silently log
 *     the same user back in via the still-valid SSO cookie — which is
 *     surprising and not what "log me out" should mean.
 *
 *  3. Authentik then redirects to `post_logout_redirect_uri`, which we
 *     point at the app's homepage (`/`). End state: cleanly anonymous,
 *     parked on a public page.
 *
 *  4. If discovery doesn't expose `end_session_endpoint` (older IdP, or
 *     local dev with placeholders) we fall back to redirecting to `/`
 *     directly. The local cookie is already gone, which is the best we
 *     can do.
 *
 * Both POST (form submit from the nav signout button) and GET (direct
 * navigation, e.g. when an action handler hands us a Location) are
 * supported so a stray bookmarked link doesn't 405.
 */
async function signOut(request: Request) {
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  cookieStore.delete(cfg.name);

  // Where to send the user after logout. Production points at the
  // public marketing/landing site; in dev/staging we fall back to the
  // request origin so this still works locally without env tweaks.
  const homepage = process.env.APP_HOME_URL?.trim()
    ? process.env.APP_HOME_URL.trim()
    : process.env.NODE_ENV === "production"
    ? "https://policy.voltmaastricht.nl/"
    : `${new URL(request.url).origin}/`;

  let target = homepage;
  try {
    const endSession = await buildEndSessionUrl(homepage);
    if (endSession) target = endSession;
  } catch {
    // OIDC misconfigured (placeholder env vars in dev). Falling back to
    // a plain local redirect is correct: the cookie is already cleared.
    target = homepage;
  }

  return NextResponse.redirect(target, { status: 303 });
}

export async function POST(request: Request) {
  return signOut(request);
}

export async function GET(request: Request) {
  return signOut(request);
}
