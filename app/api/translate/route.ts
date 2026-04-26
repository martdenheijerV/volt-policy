import { NextResponse } from "next/server";

/**
 * Translation proxy. If DEEPL_API_KEY is set, calls DeepL; otherwise returns
 * the source unchanged (so the UI flow still works).
 */
export async function POST(request: Request) {
  const { text, target } = await request.json();
  if (!text || !target) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const key = process.env.DEEPL_API_KEY;
  if (!key) {
    return NextResponse.json({
      translated: text,
      provider: "stub",
      note: "Set DEEPL_API_KEY to enable real translation.",
    });
  }
  try {
    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text,
        target_lang: target.toUpperCase(),
        tag_handling: "html",
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `DeepL responded ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({
      translated: data.translations?.[0]?.text ?? text,
      provider: "deepl",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "translation failed" },
      { status: 500 }
    );
  }
}
