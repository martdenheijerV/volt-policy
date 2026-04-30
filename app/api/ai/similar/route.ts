import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/client";

/**
 * Returns documents similar to the given query string. Uses Postgres full-text
 * search. Replace with pgvector + embeddings (#20) for true semantic similarity.
 */
export async function POST(request: Request) {
  const db = await createClient();
  const { query, excludeId } = await request.json();
  if (!query) return NextResponse.json({ error: "query missing" }, { status: 400 });

  let q = db
    .from("documents")
    .select("id,title,slug,document_type,language,status,updated_at")
    .textSearch("search_tsv", query, { type: "websearch" })
    .limit(8);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}
