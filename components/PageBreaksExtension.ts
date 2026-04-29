/**
 * PageBreaksExtension
 *
 * Tiptap / ProseMirror extension that inserts visual page breaks so a
 * top-level block (paragraph, heading, list item, blockquote, etc.)
 * never straddles the grey gap between A4 pages drawn by
 * `.editor-paper`'s repeating-linear-gradient.
 *
 * How it works
 * ------------
 * After every transaction (and on resize) we walk the *top-level*
 * children of the document, ask each one for its bounding rect
 * relative to the editor DOM, and check whether it crosses one of the
 * page boundaries (every 29.7cm = 1122px @ 96dpi).
 *
 * If a node would straddle a boundary we attach a Decoration with an
 * inline `margin-top: <Npx>` that pushes the node down so its *top*
 * lands exactly at the writable area of the next page (gap + 2cm top
 * margin past the previous page's bottom edge).
 *
 * Why decorations and not direct DOM mutation?
 * --------------------------------------------
 * ProseMirror's view recreates / diffs DOM as content changes; any
 * plain DOM tweak we made would be wiped on the next render. A
 * Decoration is the supported way to add visual hints that survive
 * re-renders.
 *
 * Trade-offs
 * ----------
 *  - A single block taller than one writable page (e.g. a giant image
 *    or an enormous code block) will still straddle — there's no way
 *    to break a single ProseMirror node mid-element without a real
 *    pagination plugin that splits nodes. We skip those.
 *  - Re-measurement happens on every transaction. With many top-level
 *    nodes the cost is ~one getBoundingClientRect per child per
 *    update; on a typical 50-paragraph doc this is well under 1ms.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// 29.7cm @ 96dpi = 1122.5px. Round down so rounding errors land us
// inside (not past) the page when checking which page a y-coord is in.
const PAGE_HEIGHT_PX = 1122;
// Grey gap between pages drawn by the .editor-paper gradient.
const GAP_PX = 24;
// 2cm A4 vertical margins (top / bottom) inside each page.
const TOP_MARGIN_PX = 76;

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
            // The view-side hook below dispatches a transaction with
            // a freshly-measured DecorationSet via setMeta(KEY, ...).
            // Otherwise we just remap the existing set so positions
            // stay valid across edits.
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
          // Signature of the last-applied decoration set — lets us
          // skip dispatching when nothing changed (otherwise every
          // measurement would loop the editor).
          let lastSig = "";

          const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const editorDom = editorView.dom as HTMLElement;
              const editorRect = editorDom.getBoundingClientRect();

              const decorations: Decoration[] = [];
              const sigParts: string[] = [];

              // descend only one level — top-level blocks are what
              // we paginate. Nested content inside lists / blockquotes
              // still flows naturally inside its parent block.
              editorView.state.doc.forEach((node, offset) => {
                const domNode = editorView.nodeDOM(offset);
                if (!(domNode instanceof HTMLElement)) return;

                const rect = domNode.getBoundingClientRect();
                const top = rect.top - editorRect.top;
                const bottom = rect.bottom - editorRect.top;

                // Skip the very first block when it sits at the top
                // of the editor — pushing it down would move ALL
                // content off the first page for no reason.
                if (top < 4) return;

                const startPage = Math.floor(top / PAGE_HEIGHT_PX);
                // Subtract a fractional pixel from the bottom so a
                // node that ends *exactly* on a page boundary isn't
                // counted as crossing.
                const endPage = Math.floor((bottom - 0.5) / PAGE_HEIGHT_PX);

                if (endPage > startPage) {
                  // Push this node so its top lands at the writable
                  // area of the page it ended on:
                  //   targetTop = endPage * PAGE_HEIGHT + GAP + TOP_MARGIN
                  const targetTop =
                    endPage * PAGE_HEIGHT_PX + GAP_PX + TOP_MARGIN_PX;
                  const marginNeeded = Math.max(0, targetTop - top);
                  if (marginNeeded < 4) return;
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      style: `margin-top: ${marginNeeded}px`,
                      class: "page-break-pushed",
                    })
                  );
                  sigParts.push(`${offset}:${marginNeeded}`);
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

          // Initial measurement, then re-measure on resize. Per-edit
          // remeasurement happens via the `update` hook below.
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
