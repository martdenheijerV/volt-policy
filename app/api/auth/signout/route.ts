import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieConfig } from "@/lib/auth/config";
import { buildEndSessionUrl } from "@/lib/auth/oidc";

/**
 * Sign-out flow.
 *
 * Two modes:
 *
 *  1. **Local-only logout (default).**
 *     We clear our own session cookie and redirect the browser straight
 *     to the app's homepage. Authentik's SSO session keeps living on
 *     the IdP, so clicking "Sign in with Volt Auth" again will succeed
 *     silently — same UX as Google Workspace, Slack, Linear, etc. when
 *     you "log out". This is the pragmatic choice: it always lands the
 *     user on a working page, doesn't require any Authentik
 *     configuration, and "log out of this app" is what the button label
 *     promises.
 *
 *  2. **Full RP-initiated logout** (opt-in via `OIDC_END_SESSION_ENABLED=1`).
 *     We additionally redirect the browser through Authentik's
 *     `end_session_endpoint` so the IdP session is killed too. This
 *     only works after `https://policy.voltmaastricht.nl/` has been
 *     registered as a *post-logout redirect URI* on the Volt Auth
 *     provider — otherwise Authentik refuses the redirect and parks
 *     the user on its own homepage. Toggle this on once that
 *     configuration is in place.
 *
 * In both modes the cookie is cleared first, so the very next page
 * load on this app treats the user as anonymous regardless of what
 * Authentik does.
 */
async function signOut(request: Request) {
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  cookieStore.delete(cfg.name);

  // Where to land. Production points at the public app entrypoint;
  // dev/staging fall back to the request origin so this still works
  // locally without env tweaks.
  const homepage = process.env.APP_HOME_URL?.trim()
    ? process.env.APP_HOME_URL.trim()
    : process.env.NODE_ENV === "production"
    ? "https://policy.voltmaastricht.nl/"
    : `${new URL(request.url).origin}/`;

  // Default = local-only logout. Skip the Authentik round-trip unless
  // explicitly enabled. Saves a redirect, removes a configuration
  // dependency, and crucially: it always works.
  if (process.env.OIDC_END_SESSION_ENABLED !== "1") {
    return NextResponse.redirect(homepage, { status: 303 });
  }

  // Opt-in: RP-initiated logout via Authentik.
  let target = homepage;
  try {
    const endSession = await buildEndSessionUrl(homepage);
    if (endSession) target = endSession;
  } catch {
    // OIDC misconfigured (placeholder env vars, network blip, etc.).
    // The local cookie is already cleared so we just send the user
    // to the homepage.
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
