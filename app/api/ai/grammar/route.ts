import { NextResponse } from "next/server";

/**
 * Grammar/spelling check via LanguageTool (free public API).
 * Returns the array of matches as-is.
 */
export async function POST(request: Request) {
  const { text, language } = await request.json();
  if (!text) return NextResponse.json({ error: "text missing" }, { status: 400 });

  const url = process.env.LANGUAGETOOL_URL ?? "https://api.languagetool.org/v2/check";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        text,
        language: language ?? "auto",
        enabledOnly: "false",
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `LanguageTool ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({
      matches: data.matches ?? [],
      language: data.language?.detectedLanguage?.code,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "grammar failed" },
      { status: 500 }
    );
  }
}
