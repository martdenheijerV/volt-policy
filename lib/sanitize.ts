import { renderMarkdown } from "./markdown";

/**
 * Minimal HTML sanitizer for content rendered with dangerouslySetInnerHTML.
 *
 * Tiptap outputs a controlled set of tags (paragraphs, headings, lists,
 * marks, links), so this strips obvious vectors:
 *   - <script>, <style>, <iframe>, <object>, <embed>
 *   - inline event handlers (on*=)
 *   - javascript: URLs
 *
 * For high-stakes hardening swap in DOMPurify or rehype-sanitize.
 */
const DANGEROUS_TAGS = /<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_DANGEROUS =
  /<(link|meta|iframe|object|embed)\b[^>]*\/?>/gi;
const ON_ATTR = /\son\w+\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]+)/gi;
const JS_HREF = /(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, "")
    .replace(SELF_CLOSING_DANGEROUS, "")
    .replace(ON_ATTR, "")
    .replace(JS_HREF, '$1="#"');
}

/**
 * If content looks like raw HTML, sanitize and return it.
 * Otherwise (legacy markdown) convert via the markdown renderer first.
 */
export function contentToHtml(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("<")) return sanitizeHtml(content);
  return renderMarkdown(content);
}
