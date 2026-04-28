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

  // Per-anchor cap so a generic quote like "Hee" or "the" can't paint
  // half the document yellow (Mart's bug report — selecting a
  // repeated word turned the whole page into a highlight). Anchors
  // that match more than this cap likely point at a generic word,
  // not the specific spot the user meant; we silently truncate rather
  // than show 50 highlights.
  const MAX_HITS_PER_ANCHOR = 3;

  for (const a of anchors) {
    if (!a.quote) continue;
    const needle = a.quote;
    let i = 0;
    let matchesForThisAnchor = 0;
    let safety = 0;
    while (safety++ < 1000) {
      const idx = flat.indexOf(needle, i);
      if (idx === -1) break;
      const start = map[idx];
      const endIdx = idx + needle.length - 1;
      if (endIdx >= map.length) break;
      const end = map[endIdx] + 1;
      decos.push(
        Decoration.inline(start, end, {
          class: "anchor-highlight",
          "data-comment-id": a.id,
        })
      );
      hits.push({ id: a.id, from: start, to: end });
      i = idx + needle.length;
      matchesForThisAnchor += 1;
      if (matchesForThisAnchor >= MAX_HITS_PER_ANCHOR) break;
    }
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
