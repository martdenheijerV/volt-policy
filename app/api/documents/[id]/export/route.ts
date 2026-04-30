import { NextResponse } from "next/server";
import TurndownService from "turndown";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
} from "docx";
import { createClient } from "@/lib/db/client";
import { contentToHtml } from "@/lib/sanitize";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  const fmt = (url.searchParams.get("format") ?? "md").toLowerCase();

  const db = await createClient();
  const { data: doc, error } = await db
    .from("documents")
    .select("title,current_content,document_type,language,slug,approved_at,current_version")
    .eq("id", id)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const html = contentToHtml(doc.current_content);
  const safeTitle = (doc.title || "document").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const filename = `${safeTitle}-v${doc.current_version}`;

  if (fmt === "html") {
    const fullHtml = `<!doctype html>
<html lang="${doc.language ?? "en"}"><head><meta charset="utf-8"/>
<title>${escapeHtml(doc.title)}</title>
<style>body{font-family:Ubuntu,system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#111}
h1{font-size:2rem;margin:1rem 0}h2{font-size:1.5rem;margin:1rem 0 .5rem}h3{font-size:1.25rem;margin:.75rem 0 .5rem}
blockquote{border-left:3px solid #7d3ec0;padding-left:1rem;color:#555}
a{color:#502089}code{background:#f5f0fb;padding:.1rem .3rem;border-radius:3px}</style>
</head><body><h1>${escapeHtml(doc.title)}</h1>${html}</body></html>`;
    return new NextResponse(fullHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.html"`,
      },
    });
  }

  if (fmt === "md") {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    const md = `# ${doc.title}\n\n${td.turndown(html)}\n`;
    return new NextResponse(md, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.md"`,
      },
    });
  }

  if (fmt === "docx") {
    const buffer = await renderDocx(doc.title, html);
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return new NextResponse(blob, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${filename}.docx"`,
      },
    });
  }

  return NextResponse.json(
    { error: "unsupported format; use md|html|docx" },
    { status: 400 }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderDocx(title: string, html: string): Promise<Buffer> {
  // Naive HTML → docx: split by block-level tags and emit paragraphs.
  // Sufficient for prose; doesn't preserve nested formatting beyond bold/italic.
  const blocks = parseBlocks(html);
  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: title, bold: true, size: 48 })],
    }),
  ];
  for (const b of blocks) paragraphs.push(...blockToParagraphs(b));

  const doc = new DocxDocument({
    creator: "Volt Policy",
    title,
    sections: [{ properties: {}, children: paragraphs }],
  });
  return await Packer.toBuffer(doc);
}

interface Block {
  tag: string;
  inner: string;
}

function parseBlocks(html: string): Block[] {
  const re =
    /<(h1|h2|h3|h4|p|li|blockquote|pre)[^>]*>([\s\S]*?)<\/\1>/gi;
  const out: Block[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push({ tag: m[1].toLowerCase(), inner: m[2] });
  }
  if (out.length === 0 && html.trim()) {
    out.push({ tag: "p", inner: html });
  }
  return out;
}

function blockToParagraphs(b: Block): Paragraph[] {
  const runs = parseRuns(b.inner);
  const children = runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        underline: r.underline ? {} : undefined,
      })
  );
  switch (b.tag) {
    case "h1":
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, children })];
    case "h2":
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, children })];
    case "h3":
      return [new Paragraph({ heading: HeadingLevel.HEADING_3, children })];
    case "h4":
      return [new Paragraph({ heading: HeadingLevel.HEADING_4, children })];
    case "blockquote":
      return [new Paragraph({ children, indent: { left: 720 } })];
    case "li":
      return [new Paragraph({ bullet: { level: 0 }, children })];
    case "pre":
      return [new Paragraph({ children, style: "Code" })];
    default:
      return [new Paragraph({ children })];
  }
}

function parseRuns(html: string): {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}[] {
  // Strip tags but track bold/italic/underline state.
  const result: { text: string; bold?: boolean; italic?: boolean; underline?: boolean }[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let i = 0;
  let buf = "";
  function flush() {
    if (buf) {
      result.push({ text: decode(buf), bold, italic, underline });
      buf = "";
    }
  }
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end === -1) break;
      const tag = html.slice(i + 1, end).toLowerCase();
      flush();
      if (tag === "strong" || tag === "b") bold = true;
      else if (tag === "/strong" || tag === "/b") bold = false;
      else if (tag === "em" || tag === "i") italic = true;
      else if (tag === "/em" || tag === "/i") italic = false;
      else if (tag === "u") underline = true;
      else if (tag === "/u") underline = false;
      else if (tag === "br" || tag === "br/") buf += "\n";
      i = end + 1;
    } else {
      buf += html[i++];
    }
  }
  flush();
  return result.length ? result : [{ text: decode(html) }];
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
