import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { createClient } from "@/lib/db/client";
import { slugify } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const docType = (form.get("document_type") as string) || "policy";
  const language = (form.get("language") as string) || "en";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file missing" }, { status: 400 });
  }

  const filename = file.name || "imported";
  const buf = Buffer.from(await file.arrayBuffer());
  let html = "";
  let title = filename.replace(/\.[^.]+$/, "");

  if (filename.toLowerCase().endsWith(".docx")) {
    try {
      const result = await mammoth.convertToHtml({ buffer: buf });
      html = result.value;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "DOCX parse failed" },
        { status: 400 }
      );
    }
  } else if (filename.toLowerCase().endsWith(".pdf")) {
    try {
      // dynamic import to avoid bundling test-fixture file at build time
      const pdfModule = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse: (b: Buffer) => Promise<{ text: string }> =
        (pdfModule as { default?: (b: Buffer) => Promise<{ text: string }> }).default ??
        (pdfModule as unknown as (b: Buffer) => Promise<{ text: string }>);
      const out = await pdfParse(buf);
      html = out.text
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("\n");
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "PDF parse failed" },
        { status: 400 }
      );
    }
  } else if (filename.toLowerCase().endsWith(".md") || filename.toLowerCase().endsWith(".txt")) {
    html = buf.toString("utf-8");
  } else if (filename.toLowerCase().endsWith(".html") || filename.toLowerCase().endsWith(".htm")) {
    html = buf.toString("utf-8");
  } else {
    return NextResponse.json(
      { error: "Unsupported file type. Use .docx, .pdf, .html, .md, .txt" },
      { status: 400 }
    );
  }

  // Generate unique slug
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let i = 1;
  while (true) {
    const { data: existing } = await db
      .from("documents")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    i += 1;
    slug = `${baseSlug}-${i}`;
  }

  const { data: doc, error } = await db
    .from("documents")
    .insert({
      title,
      slug,
      document_type: docType,
      language,
      owner_id: user.id,
      current_content: html,
      current_version: 1,
      purpose: `Imported from ${filename}`,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("document_versions").insert({
    document_id: doc.id,
    version_number: 1,
    title,
    content: html,
    change_summary: `Imported from ${filename}`,
    author_id: user.id,
  });

  return NextResponse.json({ id: doc.id, slug });
}
