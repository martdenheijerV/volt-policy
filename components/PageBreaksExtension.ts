/**
 * PageBreaksExtension
 *
 * Word-style line-level pagination for the editor. When a line of
 * text would render past the writable area of its current page (= 2cm
 * before the bottom paper edge or in the grey gap between pages), we
 * insert a `display: block` spacer widget RIGHT BEFORE that line so
 * the line — and everything after it inside the same paragraph —
 * lands at the writable-area top of the next page.
 *
 * Why we walk the DOM (and not just node geometry)
 * ------------------------------------------------
 * Block-level pagination — pushing whole `<p>` blocks past the gap —
 * leaves big empty stripes at the bottom of page 1 whenever a long
 * paragraph would have straddled. Word splits paragraphs across
 * pages line-by-line, and that's what users expect. To do that we
 * need to know where each *visual line* sits, which means asking
 * the browser via `Range.getClientRects()` for every text node.
 *
 * Stability across re-measurement rounds
 * --------------------------------------
 * Naively re-running the algorithm with our own widgets in the DOM
 * makes everything flicker — we measure the rendered position
 * (post-push), conclude "no straddle, drop the widget", which
 * un-pushes content, which restores the straddle, repeat. The
 * fix is to compute each line's *natural* top — where it would be
 * if our widgets didn't exist — by accumulating widget heights as
 * we walk the DOM. Natural tops are invariant across rounds, so
 * the computed break list is identical, the signature dedup
 * short-circuits, and no new dispatch happens.
 *
 *   naturalTop(line) = renderedTop(line) − Σ heightsOfOurWidgetsAbove(line)
 *
 * Trade-offs
 * ----------
 *  - Tables, images, and code blocks aren't split mid-element —
 *    only their containing text wraps line-by-line. A single 1500px
 *    image will still straddle the gap.
 *  - Re-measurement runs only on actual document changes (not
 *    selection moves) inside an rAF, so editor responsiveness stays
 *    smooth on long documents.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

// Pattern length of the page-gradient: white page (29.7cm) + grey
// gap (24px). Page N starts at N * PAGE_CYCLE_PX in paper coords.
const PAGE_CYCLE_PX = 1146;
const PAGE_HEIGHT_PX = 1122; // white area within one cycle
const TOP_MARGIN_PX = 76; // 2cm @ 96dpi
const BOTTOM_MARGIN_PX = 76;
// Two text rects on the same visual line can have y-tops that
// differ by a sub-pixel because of font baselines. Anything within
// this tolerance is treated as the same line.
const LINE_TOLERANCE_PX = 4;
// Class on our spacer widgets — used to detect them while walking
// the DOM so we can subtract their heights from natural-position
// calculations.
const SPACER_CLASS = "page-break-spacer";

const KEY = new PluginKey<DecorationSet>("page-breaks");

interface BreakPoint {
  pos: number;
  height: number;
}

/**
 * Walk the editor DOM, compute one entry per visual line of text
 * with its NATURAL top (= rendered top minus the sum of any
 * page-break-spacer widgets above it).
 */
function collectLines(
  view: EditorView,
  paperRect: DOMRect
): Array<{ naturalTop: number; height: number; pos: number }> {
  const editorDom = view.dom as HTMLElement;
  const entries: Array<{
    naturalTop: number;
    height: number;
    pos: number;
  }> = [];
  let widgetAccum = 0;

  function walk(el: HTMLElement) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        if (
          childEl.classList &&
          childEl.classList.contains(SPACER_CLASS)
        ) {
          widgetAccum += childEl.offsetHeight;
          continue;
        }
        walk(childEl);
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = child as Text;
        if (!text.textContent) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const rects = range.getClientRects();
        for (let j = 0; j < rects.length; j++) {
          const r = rects[j];
          if (r.width === 0 && r.height === 0) continue;
          const renderedTop = r.top - paperRect.top;
          const naturalTop = renderedTop - widgetAccum;
          // Pixel coords of the line's start (just inside left edge,
          // mid-vertical) → ProseMirror doc position. We anchor the
          // break decoration at that position.
          let pos: number | null = null;
          try {
            const result = view.posAtCoords({
              left: r.left + 1,
              top: r.top + r.height / 2,
            });
            if (result) pos = result.pos;
          } catch {
            // posAtCoords can throw on disconnected DOM during teardown.
          }
          if (pos === null) continue;
          entries.push({ naturalTop, height: r.height, pos });
        }
      }
    }
  }

  walk(editorDom);

  if (entries.length === 0) return [];

  // Sort by naturalTop, then by document position for ties.
  entries.sort((a, b) => {
    const tDiff = a.naturalTop - b.naturalTop;
    if (Math.abs(tDiff) > LINE_TOLERANCE_PX) return tDiff;
    return a.pos - b.pos;
  });

  // Dedupe by line: keep the leftmost (= earliest in document order)
  // entry per line cluster.
  const lines: Array<{ naturalTop: number; height: number; pos: number }> = [];
  for (const e of entries) {
    const last = lines[lines.length - 1];
    if (
      !last ||
      Math.abs(last.naturalTop - e.naturalTop) > LINE_TOLERANCE_PX
    ) {
      lines.push(e);
    }
    // else: same visual line, the first entry already captures it
  }

  return lines;
}

/**
 * Walk visual lines top-to-bottom, accumulating virtual page
 * breaks. A break is added whenever a line's *virtual* (post-break)
 * bottom would land in the bottom margin or the grey gap.
 */
function computeBreaks(
  lines: Array<{ naturalTop: number; height: number; pos: number }>
): BreakPoint[] {
  const breaks: BreakPoint[] = [];
  let totalBreakHeight = 0;

  for (const line of lines) {
    const virtualTop = line.naturalTop + totalBreakHeight;
    if (virtualTop < 4) continue; // skip the very top of the paper
    const virtualBottom = virtualTop + line.height;
    const currentPage = Math.max(0, Math.floor(virtualTop / PAGE_CYCLE_PX));
    const writableBottom =
      currentPage * PAGE_CYCLE_PX + PAGE_HEIGHT_PX - BOTTOM_MARGIN_PX;
    if (virtualBottom <= writableBottom + 0.5) continue;

    const targetVirtualTop =
      (currentPage + 1) * PAGE_CYCLE_PX + TOP_MARGIN_PX;
    const breakHeight = Math.round(
      Math.max(0, targetVirtualTop - virtualTop)
    );
    if (breakHeight < 4) continue;

    breaks.push({ pos: line.pos, height: breakHeight });
    totalBreakHeight += breakHeight;
  }

  return breaks;
}

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
          let lastSig = "";

          const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              const editorDom = editorView.dom as HTMLElement;
              const paperEl = editorDom.closest(
                ".editor-paper"
              ) as HTMLElement | null;
              if (!paperEl) return;
              const paperRect = paperEl.getBoundingClientRect();

              const lines = collectLines(editorView, paperRect);
              const breaks = computeBreaks(lines);
              const sig = breaks
                .map((b) => `${b.pos}:${b.height}`)
                .join(",");
              if (sig === lastSig) return;
              lastSig = sig;

              const decorations = breaks.map((b, i) =>
                Decoration.widget(
                  b.pos,
                  () => {
                    const spacer = document.createElement("span");
                    spacer.className = SPACER_CLASS;
                    spacer.setAttribute("contenteditable", "false");
                    spacer.setAttribute("aria-hidden", "true");
                    spacer.style.cssText = `display: block; width: 100%; height: ${b.height}px; pointer-events: none; user-select: none;`;
                    return spacer;
                  },
                  {
                    side: -1,
                    // Key includes pos+height so PM rebuilds the DOM
                    // when either changes; that way the spacer
                    // height stays in sync as content shifts.
                    key: `pb-${i}-${b.pos}-${b.height}`,
                  }
                )
              );

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
            update(view, prevState) {
              // Selection moves don't change layout heights, so skip
              // the (potentially expensive) DOM walk for those.
              if (view.state.doc !== prevState.doc) measure();
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
