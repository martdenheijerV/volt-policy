import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * Browser-readable session probe. Returns the currently logged-in user (id,
 * email, name) or `{ user: null }` when there is no session. Used by client
 * components that previously did `supabase.auth.getUser()` from the browser.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    {
      user: {
        id: session.userId,
        email: session.email ?? null,
        name: session.name ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
