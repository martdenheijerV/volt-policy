import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Anchor encoding for comment quotes.
 *
 * The MVP stored a comment's `anchor_quote` as the user's literal
 * selection (e.g. "Maastricht"). The matcher in `AnchorHighlights`
 * does a plain `flat.indexOf(quote)`, so when a user commented on the
 * second occurrence of a repeated word, the highlight + floating
 * card silently jumped to the first occurrence — wrong attribution,
 * a quietly bad failure mode.
 *
 * Fix: when the user's selection is not unique in the document, we
 * extend it with surrounding text until the resulting *context*
 * window appears exactly once, then store an encoded composite that
 * remembers
 *
 *   - the unique context window (so we can locate the right spot in
 *     the doc, even if the user-selected word repeats),
 *   - the offset + length of the user-selected word inside that
 *     window (so we can render a tight highlight around just the
 *     word the user picked, not the whole context).
 *
 * Backward compatible: any anchor without the sentinel is treated as
 * a plain quote, matching the old behavior. Old comments still work,
 * new comments are unambiguous.
 *
 * Wire format:
 *
 *     SOH <wordOffset> ":" <wordLength> SOH <context>
 *
 * where SOH = U+0001 (a control character that cannot appear in
 * normal user input).
 *
 *   - <wordOffset>  zero-based offset of the user's word inside
 *                   <context>
 *   - <wordLength>  length of the user's word in code units
 *   - <context>     the unique substring of the document text
 *
 * Example (user commented on the second "Maastricht" inside
 * "ja, ook in Maastricht, dit is"):
 *
 *     "10:10ja, ook in Maastricht, dit is"
 *
 * The SOH-prefixed encoded form never round-trips back into the
 * editor as visible text — `decodeAnchor` always pulls out the
 * `displayWord` for any UI surface.
 */

const SOH = "";

export interface ParsedAnchor {
  /**
   * True when the stored quote is in the encoded composite form.
   * Plain (legacy) quotes have `encoded = false`.
   */
  encoded: boolean;
  /**
   * What the user originally selected. Use this anywhere the anchor
   * is shown back to a human (compose form, comment header, email).
   */
  displayWord: string;
  /**
   * The substring of the document to search for — equal to
   * `displayWord` for plain anchors, or the wider unique window for
   * encoded anchors. Used both for highlight matching (via
   * `flat.indexOf(contextNeedle)`) and for orphan detection (via
   * `documentText.includes(contextNeedle)`).
   */
  contextNeedle: string;
  /**
   * Offset within `contextNeedle` where `displayWord` sits. Always 0
   * for plain anchors.
   */
  wordOffsetInContext: number;
  /**
   * Length of `displayWord` (cached for the matcher; equal to
   * `displayWord.length`).
   */
  wordLength: number;
}

/**
 * Parse a stored `anchor_quote` value. Never throws — falls back to
 * "plain" interpretation for any malformed encoded input, so a stray
 * SOH char in legacy data can't break the comment list.
 */
export function parseAnchor(quote: string): ParsedAnchor {
  if (!quote || !quote.startsWith(SOH)) {
    return {
      encoded: false,
      displayWord: quote ?? "",
      contextNeedle: quote ?? "",
      wordOffsetInContext: 0,
      wordLength: (quote ?? "").length,
    };
  }
  const second = quote.indexOf(SOH, 1);
  if (second < 1) {
    return plainFallback(quote);
  }
  const meta = quote.slice(1, second);
  const context = quote.slice(second + 1);
  const m = meta.match(/^(\d+):(\d+)$/);
  if (!m) return plainFallback(quote);
  const wordOffset = parseInt(m[1], 10);
  const wordLen = parseInt(m[2], 10);
  if (
    !Number.isFinite(wordOffset) ||
    !Number.isFinite(wordLen) ||
    wordOffset < 0 ||
    wordLen <= 0 ||
    wordOffset + wordLen > context.length
  ) {
    return plainFallback(quote);
  }
  const displayWord = context.substr(wordOffset, wordLen);
  return {
    encoded: true,
    displayWord,
    contextNeedle: context,
    wordOffsetInContext: wordOffset,
    wordLength: wordLen,
  };
}

function plainFallback(quote: string): ParsedAnchor {
  return {
    encoded: false,
    displayWord: quote,
    contextNeedle: quote,
    wordOffsetInContext: 0,
    wordLength: quote.length,
  };
}

/**
 * Build an encoded anchor.
 *
 *   - `displayWord`  the text the user actually selected
 *   - `wordOffset`   where in `context` the displayWord starts
 *   - `context`      the unique substring of the document text
 *
 * Caller is responsible for ensuring
 *
 *     context.substr(wordOffset, displayWord.length) === displayWord
 *
 * — this is asserted in dev builds.
 */
export function encodeAnchor(
  displayWord: string,
  wordOffset: number,
  context: string
): string {
  if (process.env.NODE_ENV !== "production") {
    const probe = context.substr(wordOffset, displayWord.length);
    if (probe !== displayWord) {
      // Defensive: caller passed inconsistent args. Fall back to plain
      // rather than store a corrupt anchor.
      // eslint-disable-next-line no-console
      console.warn(
        "[anchor] encodeAnchor inconsistency: probe !== displayWord",
        { probe, displayWord, wordOffset, context }
      );
      return displayWord;
    }
  }
  return `${SOH}${wordOffset}:${displayWord.length}${SOH}${context}`;
}

/**
 * Convenience: pull just the human-readable word out of any anchor
 * (encoded or plain). Used by every UI surface that shows the quote
 * back to the user (compose form, comment header, etc).
 */
export function anchorDisplayWord(quote: string | null | undefined): string {
  if (!quote) return "";
  return parseAnchor(quote).displayWord;
}

/**
 * Build the canonical flat text + PM-position map for a doc.
 *
 * Both makeUniqueAnchor (which slices a unique context window out of
 * the flat text) and AnchorHighlights (which locates that context in
 * the live doc and decorates the matched range) MUST agree on what
 * the flat text looks like, character for character. If they used
 * different flat representations — e.g. textBetween for one,
 * descendants() for the other — a context produced by makeUnique
 * could fail to match in AnchorHighlights even though the surface
 * text looks identical, because of differences in how each treats
 * block boundaries (lists, headings, blockquotes).
 *
 * Single source of truth: walk descendants in document order, copy
 * every text node character-by-character (recording PM position for
 * each), and insert one space at every block boundary. Identical to
 * the previous AnchorHighlights internal logic, just lifted out so
 * the editor side can reuse it.
 */
export function buildFlatDoc(doc: PMNode): {
  flat: string;
  map: number[];
} {
  let flat = "";
  const map: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        flat += node.text[i];
        map.push(pos + i);
      }
    } else if (node.isBlock && flat.length > 0 && !flat.endsWith(" ")) {
      flat += " ";
      map.push(pos);
    }
  });
  return { flat, map };
}

/**
 * Locate a ProseMirror position inside the flat text produced by
 * `buildFlatDoc`. Uses the position map to find the first flat-text
 * index whose underlying PM position is at or after `fromPos`.
 * Exact, no separator-math drift.
 */
export function flatOffsetForPos(
  map: number[],
  fromPos: number
): number {
  for (let i = 0; i < map.length; i++) {
    if (map[i] >= fromPos) return i;
  }
  return map.length;
}

/**
 * Convenience: given a stored anchor and the live document's plain
 * text, decide whether the anchor is "orphaned" — i.e. the original
 * text it pointed at has been deleted. Encoded anchors check the
 * full unique context (so a comment doesn't get wrongly resurrected
 * by a stray match elsewhere in the doc).
 *
 * Whitespace is collapsed on both sides before comparing because
 * the document text used for the check is HTML-stripped (multiple
 * consecutive spaces collapsed) while encoded contexts come from
 * Tiptap's `textBetween` (single block-boundary separator). Without
 * normalisation, a comment whose context spans a paragraph break
 * would falsely appear orphaned the moment another paragraph break
 * is added or removed nearby.
 */
export function isAnchorOrphaned(
  quote: string | null | undefined,
  documentText: string
): boolean {
  if (!quote) return false;
  if (!documentText) return false;
  const parsed = parseAnchor(quote);
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return !norm(documentText).includes(norm(parsed.contextNeedle));
}
