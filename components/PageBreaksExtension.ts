/**
 * PageBreaksExtension
 *
 * Tiptap / ProseMirror extension that pushes top-level blocks past
 * the grey gap drawn by `.editor-paper`'s repeating-linear-gradient,
 * so no text ever renders into either the bottom margin (last 2cm of
 * a page) or the gap between pages — matches Word's "no widow lines
 * past the writable area" behaviour.
 *
 * Why "preMyMargin" position
 * --------------------------
 * The naive version compared each node's *measured* (current) top to
 * the page boundaries. That causes a 60Hz flicker: pushing a node by
 * 122px moves its measured top past the boundary, the next pass
 * concludes "no straddle, drop the decoration", which un-pushes the
 * node, putting it back on the boundary, which re-pushes it.
 *
 * The fix is to compute the position the node would be at if its OWN
 * decoration didn't apply (but preceding decorations still did) —
 * we call this the *preMyMargin* top. That value is invariant across
 * measurement rounds, so the computed `newMargin` is identical every
 * round and the signature dedup short-circuits the dispatch loop.
 *
 *   measuredTop  = preMyMarginTop + myMargin     // what we see now
 *   preMyMarginTop = measuredTop - myMargin       // stable across rounds
 *
 * Page indices are computed from preMyMarginTop, which lives in
 * rendered (paper) coordinates — exactly the space the gradient
 * stripes are painted in, so the indices line up with what the user
 * sees.
 *
 * Trade-offs
 * ----------
 *  - A single block taller than one writable page (~970px) will
 *    still straddle: there's no way to break a single ProseMirror
 *    node mid-element without a much bigger pagination plugin that
 *    splits content across visual pages.
 *  - Re-measurement only runs on actual doc changes (not selection
 *    changes), inside an rAF, with a 3px hysteresis on margin
 *    updates — so the editor stays smooth while typing.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Pattern length of the page-gradient: white page (29.7cm) + grey
// gap (24px). Page N starts at N * PAGE_CYCLE_PX in paper coords.
const PAGE_CYCLE_PX = 1146;
// White page itself (without the 24px grey gap).
const PAGE_HEIGHT_PX = 1122;
// 2cm A4 top + bottom margins inside each page. Writable area on
// page N is [N*1146 + 76, N*1146 + 1046].
const TOP_MARGIN_PX = 76;
const BOTTOM_MARGIN_PX = 76;
// Don't dispatch if the margin change is smaller than this — kills
// sub-pixel ping-pong from font rendering and rect-rounding.
const MARGIN_HYSTERESIS_PX = 3;

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
          // Per-offset map of currently-applied margins. Lets us
          // apply hysteresis (skip dispatching if no margin moved
          // by more than a few pixels) without re-reading every
          // node's inline style every frame.
          const lastMargins = new Map<number, number>();

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
              const newMargins = new Map<number, number>();

              editorView.state.doc.forEach((node, offset) => {
                const domNode = editorView.nodeDOM(offset);
                if (!(domNode instanceof HTMLElement)) return;

                const rect = domNode.getBoundingClientRect();
                const measuredTop = rect.top - paperRect.top;
                // Margin we previously applied to THIS node — read
                // back from the inline style the decoration writes.
                const myMargin =
                  parseFloat(domNode.style.marginTop || "0") || 0;

                // Position this node would have if our decoration
                // on it didn't exist (but preceding decorations
                // still did — those are baked into measuredTop).
                const preMyTop = measuredTop - myMargin;
                const preMyBottom = preMyTop + rect.height;

                // Skip the very first node when it sits near the
                // top of the paper — pushing it would shove the
                // entire document down for no reason.
                if (preMyTop < 4) return;

                // Page (in rendered/paper coords) this node sits on
                // before its own decoration is applied.
                const renderPage = Math.floor(preMyTop / PAGE_CYCLE_PX);
                // Bottom edge of that page's writable area — past
                // this y-coord we're in the bottom margin or grey
                // gap, both of which are off-limits to text.
                const writableBottom =
                  renderPage * PAGE_CYCLE_PX +
                  PAGE_HEIGHT_PX -
                  BOTTOM_MARGIN_PX;

                if (preMyBottom <= writableBottom + 0.5) return;

                // Push the node so its rendered top lands at the
                // start of the next page's writable area.
                const targetRendered =
                  (renderPage + 1) * PAGE_CYCLE_PX + TOP_MARGIN_PX;
                const newMargin = Math.round(
                  Math.max(0, targetRendered - preMyTop)
                );
                if (newMargin < 4) return;

                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    style: `margin-top: ${newMargin}px`,
                    class: "page-break-pushed",
                  })
                );
                newMargins.set(offset, newMargin);
              });

              // Hysteresis: if every margin is unchanged (or moved
              // by < MARGIN_HYSTERESIS_PX), skip the dispatch. This
              // prevents 1px-jiggling from font-rendering or rect
              // rounding from re-rendering the editor every frame.
              let anyChanged = newMargins.size !== lastMargins.size;
              if (!anyChanged) {
                for (const [k, v] of newMargins) {
                  const prev = lastMargins.get(k);
                  if (prev === undefined || Math.abs(prev - v) >= MARGIN_HYSTERESIS_PX) {
                    anyChanged = true;
                    break;
                  }
                }
              }
              if (!anyChanged) return;

              lastMargins.clear();
              for (const [k, v] of newMargins) lastMargins.set(k, v);
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
            update(_view, prevState) {
              // Only re-measure on actual document changes — pure
              // selection / cursor moves don't change heights so a
              // remeasure would just burn cycles.
              if (_view.state.doc !== prevState.doc) measure();
            },
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
