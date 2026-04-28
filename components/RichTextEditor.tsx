"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { contentToHtml } from "@/lib/sanitize";
import {
  AnchorHighlights,
  anchorPluginKey,
  anchorMetaKey,
  anchorFlashMetaKey,
  type AnchorSpec,
} from "./AnchorHighlights";

export interface RichTextEditorHandle {
  scrollToAnchor: (commentId: string) => void;
  /**
   * Broadcast a doc status transition to every other client connected
   * to this Hocuspocus room. Implemented as a write to a shared Y.Map
   * called `meta` on the doc's Y.Doc — every connected peer's
   * observer fires. Returns silently in non-realtime mode.
   */
  broadcastStatus: (next: string, byName: string) => void;
  /**
   * Tell every other client connected to this Hocuspocus room that the
   * comments list changed (someone added / resolved / deleted a comment).
   * Other clients observe `meta.commentsChanged` and refetch the comments
   * server-side via router.refresh(). No payload — just a tick.
   */
  broadcastCommentsChanged: () => void;
}

interface RealtimeConfig {
  url: string;
  documentId: string;
  token: string;
  user: { name: string; color: string };
}

interface Props {
  initialContent: string;
  editable: boolean;
  anchors: AnchorSpec[];
  onChange: (html: string) => void;
  onSelectionText: (text: string) => void;
  onCommentRequest: (text: string) => void;
  onAnchorClickInDoc?: (commentId: string) => void;
  realtime?: RealtimeConfig | null;
  /**
   * Fired when ANOTHER client broadcasts a status transition through the
   * shared Y.Map `meta`. The current client's own writes don't fire this —
   * we rely on the regular Next.js revalidation for the local browser.
   */
  onRemoteStatusChange?: (next: string, byName: string) => void;
  /**
   * Fires when another client on this Hocuspocus room signalled that
   * comments changed. The parent typically calls router.refresh() to
   * pull the new comment list — RLS keeps everyone honest about what
   * they can see.
   */
  onRemoteCommentsChanged?: () => void;
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  function RichTextEditor(
    {
      initialContent,
      editable,
      anchors,
      onChange,
      onSelectionText,
      onCommentRequest,
      onAnchorClickInDoc,
      realtime,
      onRemoteStatusChange,
  onRemoteCommentsChanged,
    },
    ref
  ) {
    const [connected, setConnected] = useState(false);
    const [peers, setPeers] = useState<{ name: string; color: string }[]>([]);

    // One Y.Doc + provider per documentId, kept stable across renders.
    const ydocRef = useRef<Y.Doc | null>(null);
    const providerRef = useRef<HocuspocusProvider | null>(null);

    if (realtime && !ydocRef.current) {
      ydocRef.current = new Y.Doc();
    }

    useEffect(() => {
      if (!realtime || !ydocRef.current) return;
      const provider = new HocuspocusProvider({
        url: realtime.url,
        name: `doc:${realtime.documentId}`,
        document: ydocRef.current,
        token: realtime.token,
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
        onAwarenessUpdate: ({ states }) => {
          const others: { name: string; color: string }[] = [];
          for (const s of states) {
            const u = (s as { user?: { name?: string; color?: string } }).user;
            if (u && u.name && u.name !== realtime.user.name) {
              others.push({ name: u.name, color: u.color ?? "#999" });
            }
          }
          setPeers(others);
        },
      });
      providerRef.current = provider;
      return () => {
        provider.destroy();
        providerRef.current = null;
        setConnected(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [realtime?.url, realtime?.documentId]);

    const extensions = useMemo<AnyExtension[]>(() => {
      const base: AnyExtension[] = [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // Yjs ships its own undo manager — disable Tiptap's history when collaborative.
          history: realtime ? false : undefined,
          codeBlock: {},
        }) as AnyExtension,
        Underline as AnyExtension,
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
            class: "text-volt-700 underline",
          },
        }) as AnyExtension,
        Placeholder.configure({
          placeholder: "Start writing your policy…",
        }) as AnyExtension,
        AnchorHighlights.configure({ anchors }) as AnyExtension,
      ];
      if (realtime && ydocRef.current && providerRef.current) {
        base.push(
          Collaboration.configure({ document: ydocRef.current }) as AnyExtension
        );
        base.push(
          CollaborationCursor.configure({
            provider: providerRef.current,
            user: realtime.user,
          }) as AnyExtension
        );
      }
      return base;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [realtime?.url, realtime?.documentId, providerRef.current]);

    const editor = useEditor(
      {
        extensions,
        // When collaborative, content comes from Y.Doc; only seed on first open.
        content: realtime ? "" : contentToHtml(initialContent),
        editable,
        immediatelyRender: false,
        onUpdate: ({ editor }) => {
          onChange(editor.getHTML());
        },
        onSelectionUpdate: ({ editor }) => {
          const { from, to, empty } = editor.state.selection;
          if (empty) {
            onSelectionText("");
            return;
          }
          const text = editor.state.doc.textBetween(from, to, " ").trim();
          onSelectionText(text);
        },
        editorProps: {
          attributes: {
            class:
              "prose-doc focus:outline-none min-h-[420px] px-5 py-4 text-slate-900",
          },
        },
      },
      // Recreate editor when realtime config changes (e.g. provider ready)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [realtime?.url, realtime?.documentId, providerRef.current]
    );

    // Live status sync: every client connected to this Hocuspocus room
    // shares a Y.Map called `meta` on the Y.Doc. When one client writes
    // `statusTransition` (typically the admin clicking Send to review or
    // Approve / Reject), every other client's observer fires and we
    // call onRemoteStatusChange so the parent can show a toast and
    // reload to pick up the new locked / unlocked state.
    useEffect(() => {
      if (!realtime) return;
      const ydoc = ydocRef.current;
      if (!ydoc) return;
      const meta = ydoc.getMap("meta");
      // One observer for the whole `meta` map — branches per key so a
      // single Y.Doc round-trip can carry status changes, comment
      // pings, and any future "this changed" signals.
      const observer = () => {
        if (onRemoteStatusChange) {
          const t = meta.get("statusTransition") as
            | { to?: string; byName?: string }
            | undefined;
          if (t && typeof t.to === "string") {
            onRemoteStatusChange(t.to, t.byName ?? "");
          }
        }
        if (onRemoteCommentsChanged) {
          const c = meta.get("commentsChanged") as
            | { at?: number }
            | undefined;
          if (c && typeof c.at === "number") {
            onRemoteCommentsChanged();
          }
        }
      };
      meta.observe(observer);
      return () => {
        meta.unobserve(observer);
      };
    }, [realtime, onRemoteStatusChange, onRemoteCommentsChanged]);

    // First-time seed: when realtime is on and the Y.Doc is empty after sync,
    // load the saved HTML once so existing docs keep their content.
    //
    // Two failure modes this guards against:
    //  1. The `synced` event fires *before* this effect attaches the
    //     listener (race when WS handshake is fast). We check
    //     `provider.synced` synchronously and run the seed immediately
    //     if it's already true.
    //  2. The seed runs but the editor isn't ready to accept commands
    //     yet — handled by the `editor` dep, which only resolves once
    //     useEditor has mounted.
    useEffect(() => {
      if (!realtime || !editor) return;
      const provider = providerRef.current;
      const ydoc = ydocRef.current;
      if (!provider || !ydoc) return;

      let cancelled = false;
      const seedIfEmpty = () => {
        if (cancelled) return;
        // Check both the raw Y.Doc fragment AND the editor's perceived
        // emptiness — the Y.Doc can hold a single empty paragraph
        // (length === 1) which still feels "empty" to a user, e.g. when
        // a previous failed session persisted a blank state.
        const fragment = ydoc.getXmlFragment("default");
        const editorEmpty = editor.isEmpty;
        const ydocEffectivelyEmpty = fragment.length === 0 || editorEmpty;
        if (ydocEffectivelyEmpty && initialContent) {
          editor.commands.setContent(contentToHtml(initialContent));
        }
      };

      // Catch the case where sync already finished before we got here.
      const alreadySynced = (provider as { synced?: boolean }).synced;
      if (alreadySynced) {
        seedIfEmpty();
      }
      // Always also listen — handles the normal "still connecting" case
      // and any reconnection-and-resync after a network blip.
      provider.on("synced", seedIfEmpty);
      return () => {
        cancelled = true;
        provider.off("synced", seedIfEmpty);
      };
    }, [editor, realtime, initialContent]);

    useEffect(() => {
      if (editor) editor.setEditable(editable);
    }, [editor, editable]);

    useEffect(() => {
      if (!editor) return;
      const tr = editor.state.tr.setMeta(anchorMetaKey, anchors);
      editor.view.dispatch(tr);
    }, [editor, anchors]);

    useEffect(() => {
      if (!editor || !onAnchorClickInDoc) return;
      const dom = editor.view.dom as HTMLElement;
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const hit = target?.closest<HTMLElement>("[data-comment-id]");
        if (!hit) return;
        const id = hit.getAttribute("data-comment-id");
        if (id) onAnchorClickInDoc(id);
      };
      dom.addEventListener("click", handler);
      return () => dom.removeEventListener("click", handler);
    }, [editor, onAnchorClickInDoc]);

    useImperativeHandle(
      ref,
      () => ({
        broadcastStatus(next: string, byName: string) {
          const ydoc = ydocRef.current;
          if (!ydoc) return;
          const meta = ydoc.getMap("meta");
          // Bundle status + author + a monotonically-increasing tick so
          // every transition is a fresh value (otherwise observers don't
          // fire if the same status is set twice in a row).
          meta.set("statusTransition", {
            to: next,
            byName,
            at: new Date().toISOString(),
          });
        },
        broadcastCommentsChanged() {
          const ydoc = ydocRef.current;
          if (!ydoc) return;
          const meta = ydoc.getMap("meta");
          // Just a fresh timestamp — observers see "this changed",
          // refresh, get the new comment list from the server.
          meta.set("commentsChanged", { at: Date.now() });
        },
        scrollToAnchor(commentId: string) {
          if (!editor) return;
          const ps = anchorPluginKey.getState(editor.state) as
            | { hits: { id: string; from: number; to: number }[] }
            | undefined;
          const hit = ps?.hits.find((h) => h.id === commentId);
          if (!hit) return;
          editor.commands.setTextSelection({ from: hit.from, to: hit.to });
          editor.commands.scrollIntoView();
          editor.view.dispatch(
            editor.state.tr.setMeta(anchorFlashMetaKey, {
              from: hit.from,
              to: hit.to,
            })
          );
          setTimeout(() => {
            editor.view.dispatch(
              editor.state.tr.setMeta(anchorFlashMetaKey, null)
            );
          }, 1500);
          const dom = editor.view.dom as HTMLElement;
          dom
            .querySelector<HTMLElement>(
              `[data-comment-id="${cssEscape(commentId)}"]`
            )
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        },
      }),
      [editor]
    );

    if (!editor) {
      return (
        <div className="min-h-[420px] animate-pulse rounded-b border-t bg-slate-50" />
      );
    }

    return (
      <div className="rounded-b border-t border-slate-200 bg-white">
        {realtime && (
          <PresenceBar
            connected={connected}
            self={realtime.user}
            peers={peers}
          />
        )}
        {editable ? (
          <Toolbar editor={editor} onCommentRequest={onCommentRequest} />
        ) : (
          <ReadOnlyBar editor={editor} onCommentRequest={onCommentRequest} />
        )}
        <EditorContent editor={editor} />
      </div>
    );
  }
);

export default RichTextEditor;

function PresenceBar({
  connected,
  self,
  peers,
}: {
  connected: boolean;
  self: { name: string; color: string };
  peers: { name: string; color: string }[];
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          connected ? "bg-green-500" : "bg-slate-300"
        }`}
        aria-label={connected ? "Connected to realtime" : "Reconnecting…"}
      />
      <span className="text-slate-500">
        {connected ? "Live" : "Reconnecting…"}
      </span>
      <div className="ml-2 flex items-center gap-1">
        <Avatar user={self} self />
        {peers.map((p, i) => (
          <Avatar key={p.name + i} user={p} />
        ))}
      </div>
      {peers.length > 0 && (
        <span className="ml-1 text-slate-500">
          {peers.length === 1
            ? `${peers[0].name} is editing`
            : `${peers.length} others editing`}
        </span>
      )}
    </div>
  );
}

function Avatar({
  user,
  self,
}: {
  user: { name: string; color: string };
  self?: boolean;
}) {
  const initials = (user.name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      title={self ? `${user.name} (you)` : user.name}
      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white"
      style={{ background: user.color }}
    >
      {initials}
    </span>
  );
}

function cssEscape(s: string): string {
  if (typeof window !== "undefined" && "CSS" in window && window.CSS?.escape) {
    return window.CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function ReadOnlyBar({
  editor,
  onCommentRequest,
}: {
  editor: Editor;
  onCommentRequest: (text: string) => void;
}) {
  const selectionEmpty = editor.state.selection.empty;
  function commentOnSelection() {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    onCommentRequest(text);
  }
  return (
    <div className="flex items-center justify-end border-b border-slate-200 bg-slate-50 px-3 py-2">
      <button
        type="button"
        onClick={commentOnSelection}
        disabled={selectionEmpty}
        className="rounded bg-volt-600 px-3 py-1 text-xs font-medium text-white hover:bg-volt-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Select text and click to anchor a comment"
      >
        💬 Comment on selection
      </button>
    </div>
  );
}

function Toolbar({
  editor,
  onCommentRequest,
}: {
  editor: Editor;
  onCommentRequest: (text: string) => void;
}) {
  const Btn = ({
    onClick,
    active,
    children,
    title,
    disabled,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title: string;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      // onMouseDown with preventDefault stops the editor losing focus
      // when the user clicks a toolbar button. Without this, the first
      // click steals focus → Tiptap's `.focus()` chain re-acquires it
      // but the toggle command runs against an empty selection, so
      // the user sees nothing change and clicks again. Two-clicks bug.
      // Standard Tiptap toolbar pattern.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={`rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 ${
        active ? "bg-slate-900 text-white hover:bg-slate-900" : ""
      }`}
    >
      {children}
    </button>
  );

  function setLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function commentOnSelection() {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      window.alert("Select some text first to anchor a comment to it.");
      return;
    }
    const text = editor.state.doc.textBetween(from, to, " ").trim();
    onCommentRequest(text);
  }

  const selectionEmpty = editor.state.selection.empty;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
      <Btn title="Bold (Ctrl+B)" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        <strong>B</strong>
      </Btn>
      <Btn title="Italic (Ctrl+I)" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <em>I</em>
      </Btn>
      <Btn title="Underline (Ctrl+U)" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
        <span className="underline">U</span>
      </Btn>
      <Btn title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
        <span className="line-through">S</span>
      </Btn>

      <Divider />

      <Btn title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}>H1</Btn>
      <Btn title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>H2</Btn>
      <Btn title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>H3</Btn>
      <Btn title="Paragraph" onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")}>¶</Btn>

      <Divider />

      <Btn title="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>•</Btn>
      <Btn title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>1.</Btn>
      <Btn title="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>❝</Btn>
      <Btn title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>{"</>"}</Btn>

      <Divider />

      <Btn title="Link" onClick={setLink} active={editor.isActive("link")}>🔗</Btn>

      <Divider />

      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()}>↶</Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()}>↷</Btn>

      <div className="ml-auto">
        <button
          type="button"
          onClick={commentOnSelection}
          disabled={selectionEmpty}
          className="rounded bg-volt-600 px-3 py-1 text-xs font-medium text-white hover:bg-volt-700 disabled:cursor-not-allowed disabled:opacity-40"
          title="Add comment on selected text"
        >
          💬 Comment on selection
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;
}
