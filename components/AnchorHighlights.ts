import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { parseAnchor } from "@/lib/anchor";

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

  // Plain-anchor cap so a generic quote like "Hee" or "the" can't
  // paint half the document yellow (Mart's earlier bug report —
  // selecting a repeated word turned the whole page into a
  // highlight). Encoded anchors don't need this — they always
  // resolve to exactly one decoration.
  const MAX_HITS_PER_PLAIN_ANCHOR = 3;

  for (const a of anchors) {
    if (!a.quote) continue;
    const parsed = parseAnchor(a.quote);

    if (parsed.encoded) {
      // Encoded composite: locate the unique context window first,
      // then highlight only the user-selected word inside it. This
      // is the path that fixes commenting-on-the-second-occurrence
      // — `parsed.contextNeedle` is unique by construction (when
      // makeUniqueAnchor managed it), so flat.indexOf returns the
      // right spot.
      const ctxIdx = flat.indexOf(parsed.contextNeedle);
      if (ctxIdx === -1) continue; // orphaned — original text deleted
      const wordIdx = ctxIdx + parsed.wordOffsetInContext;
      const wordEndIdx = wordIdx + parsed.wordLength - 1;
      if (wordIdx >= map.length || wordEndIdx >= map.length) continue;
      const start = map[wordIdx];
      const end = map[wordEndIdx] + 1;
      decos.push(
        Decoration.inline(start, end, {
          class: "anchor-highlight",
          "data-comment-id": a.id,
        })
      );
      hits.push({ id: a.id, from: start, to: end });
      continue;
    }

    // Plain (legacy) anchor: paint every match up to the cap.
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
      if (matchesForThisAnchor >= MAX_HITS_PER_PLAIN_ANCHOR) break;
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
