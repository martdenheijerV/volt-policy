/**
 * Tiny, dependency-free Markdown → HTML renderer.
 * Covers: headings, bold/italic, inline code, code blocks, links,
 * unordered/ordered lists, blockquotes, and paragraphs.
 *
 * Escapes HTML in raw text to avoid XSS since we render with dangerouslySetInnerHTML.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // links
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-volt-700 underline">$1</a>'
  );
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inQuote = false;

  function closeLists() {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
    if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith("```")) {
      closeLists();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      i += 1;
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // blockquote
    if (line.startsWith(">")) {
      if (!inQuote) {
        closeLists();
        out.push("<blockquote>");
        inQuote = true;
      }
      out.push(`<p>${inline(line.replace(/^>\s?/, ""))}</p>`);
      i += 1;
      continue;
    } else if (inQuote) {
      out.push("</blockquote>");
      inQuote = false;
    }

    // unordered list
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (!inUl) {
        closeLists();
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    // ordered list
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (!inOl) {
        closeLists();
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    // blank line
    if (line.trim() === "") {
      closeLists();
      i += 1;
      continue;
    }

    // paragraph
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
    i += 1;
  }

  closeLists();
  return out.join("\n");
}
