/**
 * PageBreaksExtension
 *
 * Tiptap / ProseMirror extension that inserts visual page breaks so a
 * top-level block (paragraph, heading, list item, blockquote, etc.)
 * never straddles the grey gap between A4 pages drawn by
 * `.editor-paper`'s repeating-linear-gradient.
 *
 * Why "natural position" matters
 * ------------------------------
 * The naive version compared each node's *measured* top (the position
 * we see in the DOM) to the page boundaries. That deadlocks: once we
 * push a node by setting `margin-top: 122px`, its measured top moves
 * past the boundary, the next pass concludes "no straddle, remove
 * the decoration", which un-pushes the node, which puts it back on
 * the boundary, which re-pushes it. Result: 60Hz flicker.
 *
 * The fix is to subtract any margin we've previously applied (both
 * to the current node and to all preceding nodes) from the measured
 * position to get the node's *natural* position — where it would sit
 * if our extension didn't exist. The straddle test runs on the
 * natural position, which is invariant across measurement rounds, so
 * the computed `marginNeeded` is the same every round and the
 * signature dedup short-circuits the dispatch loop.
 *
 * Coordinate space
 * ----------------
 * The page-gap gradient lives on `.editor-paper` (the white sheet),
 * NOT on the ProseMirror element directly — the toolbar and title
 * slot sit between paper-top and ProseMirror-top. We measure
 * positions relative to the paper element, so the boundaries (every
 * 1146px = 29.7cm + 24px gap) line up with the gradient stripes.
 *
 * Trade-offs
 * ----------
 *  - A single block taller than one writable page (giant image,
 *    massive code block) will still straddle — there's no way to
 *    break a single ProseMirror node mid-element without a much
 *    bigger pagination plugin that splits content.
 *  - Re-measurement runs on every transaction inside an rAF, so the
 *    cost is bounded to roughly one getBoundingClientRect per
 *    top-level child per frame. Well under 1ms for typical docs.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Pattern length of the page-gradient: white page (29.7cm) + grey
// gap (24px). Page N starts at N * PAGE_CYCLE_PX in paper coords.
const PAGE_CYCLE_PX = 1146;
// White page itself (without the 24px grey gap).
const PAGE_HEIGHT_PX = 1122;
// 2cm A4 top + bottom margins inside each page. The writable area
// of page N runs [N * PAGE_CYCLE_PX + TOP_MARGIN_PX,
// N * PAGE_CYCLE_PX + PAGE_HEIGHT_PX - BOTTOM_MARGIN_PX] = [+76, +1046].
const TOP_MARGIN_PX = 76;
const BOTTOM_MARGIN_PX = 76;

const KEY = new PluginKey<DecorationSet>("page-breaks");

export const PageBreaksExtension = Extension.create({
  name: "pageBreaks",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const incoming = tr.getMeta(KEY);
            if (incoming instanceof DecorationSet) return incoming;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return KEY.getState(state) ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let raf = 0;
          // Signature of the last-applied set so we don't loop the
          // editor by re-dispatching identical decorations.
          let lastSig = "";

          const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const editorDom = editorView.dom as HTMLElement;
              // Walk up to the .editor-paper element — that's the
              // origin for our page-gradient coordinate space.
              const paperEl = editorDom.closest(
                ".editor-paper"
              ) as HTMLElement | null;
              if (!paperEl) return;
              const paperRect = paperEl.getBoundingClientRect();

              const decorations: Decoration[] = [];
              const sigParts: string[] = [];
              // Sum of margins we've added to nodes already visited
              // in this pass. Used to recover each node's natural
              // (un-pushed) top from its measured top.
              let cumulativePush = 0;

              editorView.state.doc.forEach((node, offset) => {
                const domNode = editorView.nodeDOM(offset);
                if (!(domNode instanceof HTMLElement)) return;

                const rect = domNode.getBoundingClientRect();
                const measuredTop = rect.top - paperRect.top;
                // Margin we previously set on THIS node (from a
                // prior measurement round). The decoration writes
                // it as inline style, so reading it back is reliable.
                const myMargin =
                  parseFloat(domNode.style.marginTop || "0") || 0;

                // Recover the position this node would have without
                // any of our pushes.
                const naturalTop = measuredTop - cumulativePush - myMargin;
                const naturalBottom = naturalTop + rect.height;

                // Skip the very first node when it sits near the
                // top of the paper — pushing it would shove the
                // entire document down for no reason.
                if (naturalTop < 4) return;

                // The page this node *starts* on, and the bottom
                // edge of that page's writable area (= the line
                // below which content would land in the bottom
                // margin or the grey gap — both of which Word
                // refuses to render text into).
                const pageTop = Math.floor(naturalTop / PAGE_CYCLE_PX);
                const writableBottom =
                  pageTop * PAGE_CYCLE_PX +
                  PAGE_HEIGHT_PX -
                  BOTTOM_MARGIN_PX;

                if (naturalBottom > writableBottom + 0.5) {
                  // Push to the writable-area start of the next page.
                  const targetRendered =
                    (pageTop + 1) * PAGE_CYCLE_PX + TOP_MARGIN_PX;
                  // measuredTop = naturalTop + cumulativePush + myMargin
                  // We want measuredTop_after = targetRendered
                  //   ⇒  newMargin = targetRendered - naturalTop - cumulativePush
                  const newMargin = Math.round(
                    Math.max(0, targetRendered - naturalTop - cumulativePush)
                  );
                  if (newMargin < 4) return;
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      style: `margin-top: ${newMargin}px`,
                      class: "page-break-pushed",
                    })
                  );
                  sigParts.push(`${offset}:${newMargin}`);
                  cumulativePush += newMargin;
                }
              });

              const sig = sigParts.join(",");
              if (sig === lastSig) return;
              lastSig = sig;
              editorView.dispatch(
                editorView.state.tr.setMeta(
                  KEY,
                  DecorationSet.create(editorView.state.doc, decorations)
                )
              );
            });
          };

          measure();
          window.addEventListener("resize", measure);

          return {
            update: measure,
            destroy() {
              cancelAnimationFrame(raf);
              window.removeEventListener("resize", measure);
            },
          };
        },
      }),
    ];
  },
});

export default PageBreaksExtension;
