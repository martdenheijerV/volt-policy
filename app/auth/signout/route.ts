import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieConfig } from "@/lib/auth/config";

/**
 * Deprecated path — kept as a 303 redirect to /api/auth/signout so that any
 * cached browser forms or external links continue to log the user out.
 *
 * The new EU-pure signout lives at /api/auth/signout.
 */
export async function POST(request: Request) {
  // Defensively clear the cookie here too in case a client posts directly.
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  cookieStore.delete(cfg.name);
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
