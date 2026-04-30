import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/client";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/dictionaries";

export async function POST(req: Request) {
  const { lang } = await req.json();
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    return NextResponse.json({ error: "invalid lang" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("volt_lang", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // Persist on profile if signed in
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      await db.from("profiles").update({ language_pref: lang }).eq("id", user.id);
    }
  } catch {
    /* ignore */
  }
  return res;
}
