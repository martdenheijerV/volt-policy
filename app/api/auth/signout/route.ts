import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCookieConfig } from "@/lib/auth/config";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const cfg = getCookieConfig();
  cookieStore.delete(cfg.name);
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
