import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface AnchorSpec {
  id: string;
  quote: string;
}

export interface AnchorHit {
  id: string;
  from: number;
  to: number;
}

export const anchorPluginKey = new PluginKey<DecorationSet>("anchorHighlights");
export const anchorMetaKey = "anchorHighlightsUpdate";
export const anchorFlashMetaKey = "anchorHighlightsFlash";

function buildDecorations(
  doc: PMNode,
  anchors: AnchorSpec[],
  flashRange: { from: number; to: number } | null
): { set: DecorationSet; hits: AnchorHit[] } {
  const decos: Decoration[] = [];
  const hits: AnchorHit[] = [];

  // Build a flat plain-text view of the document to allow matching anchors that
  // span multiple text nodes (e.g. a selection across two paragraphs).
  // We keep a parallel array of mappings from string offset -> ProseMirror pos.
  let flat = "";
  const map: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        flat += node.text[i];
        map.push(pos + i);
      }
    } else if (node.isBlock && flat.length > 0 && !flat.endsWith(" ")) {
      // Tiptap's textBetween uses a single space separator across blocks.
      flat += " ";
      map.push(pos);
    }
  });

  for (const a of anchors) {
    if (!a.quote) continue;
    const needle = a.quote;
    // Skip very short anchors entirely — they match too aggressively
    // ("e", "te", "Hee" etc. would highlight half the document). The
    // floating-comment UX assumes one card per unique anchor quote;
    // sub-8-char quotes are usually accidental clicks anyway.
    if (needle.trim().length < 8) continue;
    // Highlight ONLY the first occurrence. Earlier we matched every
    // copy of the quote text, which painted yellow over the entire
    // doc when the quote was a repeated word (Mart's bug report:
    // "HeeHeeHee..." selection turning the whole page yellow).
    // For multi-occurrence support we'd need to store position
    // offsets in the DB; that's a separate refactor.
    const idx = flat.indexOf(needle);
    if (idx === -1) continue;
    const start = map[idx];
    const endIdx = idx + needle.length - 1;
    if (endIdx >= map.length) continue;
    const end = map[endIdx] + 1;
    decos.push(
      Decoration.inline(start, end, {
        class: "anchor-highlight",
        "data-comment-id": a.id,
      })
    );
    hits.push({ id: a.id, from: start, to: end });
  }

  if (flashRange) {
    decos.push(
      Decoration.inline(flashRange.from, flashRange.to, {
        class: "anchor-flash",
      })
    );
  }

  return { set: DecorationSet.create(doc, decos), hits };
}

interface AnchorState {
  anchors: AnchorSpec[];
  set: DecorationSet;
  hits: AnchorHit[];
  flash: { from: number; to: number } | null;
}

export const AnchorHighlights = Extension.create<{ anchors: AnchorSpec[] }>({
  name: "anchorHighlights",

  addOptions() {
    return { anchors: [] };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<AnchorState>({
        key: anchorPluginKey as unknown as PluginKey<AnchorState>,
        state: {
          init: (_, state) => {
            const { set, hits } = buildDecorations(
              state.doc,
              options.anchors,
              null
            );
            return { anchors: options.anchors, set, hits, flash: null };
          },
          apply: (tr, prev) => {
            const updated = tr.getMeta(anchorMetaKey) as
              | AnchorSpec[]
              | undefined;
            const flash = tr.getMeta(anchorFlashMetaKey) as
              | { from: number; to: number }
              | null
              | undefined;

            if (updated || flash !== undefined || tr.docChanged) {
              const anchors = updated ?? prev.anchors;
              const flashRange = flash !== undefined ? flash : prev.flash;
              const { set, hits } = buildDecorations(
                tr.doc,
                anchors,
                flashRange
              );
              return { anchors, set, hits, flash: flashRange };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const ps = (this as Plugin<AnchorState>).getState(state);
            return ps?.set ?? null;
          },
        },
      }),
    ];
  },
});
