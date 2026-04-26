import { NextResponse, type NextRequest } from "next/server";
import { getCookieConfig } from "./config";
import { verifySession } from "./session";

/**
 * Auth-aware middleware: redirects unauthenticated users hitting protected
 * routes to /login. Session lives in a JWT cookie signed with COOKIE_SECRET.
 */
export async function authMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/documents") ||
    path.startsWith("/settings") ||
    path.startsWith("/admin");

  if (!isProtected) return NextResponse.next();

  const cfg = getCookieConfig();
  const token = request.cookies.get(cfg.name)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
