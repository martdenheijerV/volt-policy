/**
 * FontSizeExtension
 *
 * A minimal Tiptap mark that wraps the selection in
 * `<span style="font-size: <value>">…</span>`. Mirrors the way Word's
 * font-size dropdown works: pick a size, the selection (or — if the
 * cursor is collapsed — the next typed text) renders at that size.
 *
 * We could have pulled in `@tiptap/extension-text-style` plus the
 * community `extension-font-size` package, but the dependency churn
 * isn't worth it for one CSS property — this is ~40 lines, all the
 * standard Tiptap mark hooks, and uses no extra runtime deps.
 */

import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSizeExtension = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      fontSize: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.style.fontSize || null,
        renderHTML: (attrs: { fontSize?: string | null }) => {
          if (!attrs.fontSize) return {};
          return { style: `font-size: ${attrs.fontSize}` };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        // Match any span carrying an inline font-size — keeps round-
        // trips through copy/paste sane.
        tag: "span",
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const size = node.style.fontSize;
          return size ? { fontSize: size } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark(this.name, { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});

export default FontSizeExtension;
