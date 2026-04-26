import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/client";
import { contentToHtml } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";

/**
 * Generate a draft document via Mistral AI (La Plateforme, France).
 * Requires MISTRAL_API_KEY. Falls back to a stub when no key is set.
 *
 * Pulls a few existing approved documents as in-corpus context (req. #21).
 * Audit-logged per principle #6.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { prompt, type } = await request.json();
  if (!prompt) return NextResponse.json({ error: "prompt missing" }, { status: 400 });

  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    return NextResponse.json({
      draft: `<h1>${prompt}</h1><p><em>Draft generation requires MISTRAL_API_KEY to be set on the server (Mistral AI, La Plateforme).</em></p>`,
      provider: "stub",
    });
  }

  const { data: ctx } = await supabase
    .from("documents")
    .select("title,current_content")
    .eq("status", "approved")
    .limit(3);
  const contextText = (ctx ?? [])
    .map((d) => `# ${d.title}\n\n${d.current_content.slice(0, 2000)}`)
    .join("\n\n---\n\n");

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL ?? "mistral-large-latest",
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content:
              "You are a policy drafter for Volt Europa. Write in clean HTML using only <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <blockquote>. Match Volt's tone: progressive, evidence-based, European. Use the provided existing documents as style and positional references.",
          },
          {
            role: "user",
            content: `Existing Volt documents for context:\n\n${contextText}\n\n---\n\nDraft a new ${type ?? "policy"} document for the topic: ${prompt}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `Mistral API ${res.status}: ${txt.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    await logAudit("ai.draft", "ai", null, { prompt: prompt.slice(0, 200), provider: "mistral" });
    return NextResponse.json({ draft: contentToHtml(text), provider: "mistral" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "draft failed" },
      { status: 500 }
    );
  }
}
