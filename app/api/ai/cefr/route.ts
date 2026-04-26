import { NextResponse } from "next/server";
import { estimateCEFR } from "@/lib/cefr";

export async function POST(request: Request) {
  const { text } = await request.json();
  if (!text) return NextResponse.json({ error: "text missing" }, { status: 400 });
  return NextResponse.json(estimateCEFR(text));
}
