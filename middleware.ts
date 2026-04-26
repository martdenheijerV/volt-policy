import { authMiddleware } from "@/lib/auth/middleware";
import { type NextRequest } from "next/server";

// EU-pure auth: validates the JWT cookie set by /api/auth/callback and
// redirects unauthenticated users hitting /(app)/* routes to /login. See
// CLAUDE.md principle #5 (OIDC only — never SAML).

export async function middleware(request: NextRequest) {
  return await authMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
