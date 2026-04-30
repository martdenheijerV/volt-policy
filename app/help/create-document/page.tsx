import { T } from "@/components/T";

export default function HelpCreateDocument() {
  return (
    <>
      <h1>
        <T>Writing &amp; editing</T>
      </h1>
      <p>
        <T>
          Editors and admins can create new documents from the dashboard.
          Members can edit only documents where they have been granted
          per-document edit access.
        </T>
      </p>

      <h2>
        <T>Creating a new document</T>
      </h2>
      <p>
        <T>
          + New document opens a small dialog asking for type (policy /
          position / resolution / statement / motion), original language and
          a one-sentence purpose. Tags and per-organization metadata fields
          can be filled in later from the document&apos;s settings menu. The
          body starts empty — you write the title yourself as the first
          heading.
        </T>
      </p>

      <h2>
        <T>The Word-style editor</T>
      </h2>
      <p>
        <T>
          The writing area is an A4 page (820 px wide, 624 px writing column,
          2 cm top + bottom margin) on a grey desk. Page breaks appear every
          29.7 cm — text never flows through the gap; lines that wouldn&apos;t
          fit jump to the next page automatically, the same way Word does it.
          A horizontal scroll never happens; only the page itself scrolls.
        </T>
      </p>
      <p>
        <T>
          The formatting toolbar sticks to the top of the viewport while you
          scroll, so bold, headings, lists and the AI assistant are always
          one click away. Headings (H1, H2, H3) drive the document&apos;s
          outline — the persisted title is taken from the first heading you
          type, falling back to the first visible line if there are no
          headings yet.
        </T>
      </p>
      <h3>
        <T>Toolbar at a glance</T>
      </h3>
      <ul>
        <li>
          <T>
            Bold, Italic, Underline, Strikethrough — the usual keyboard
            shortcuts apply (Ctrl/Cmd+B, I, U).
          </T>
        </li>
        <li>
          <T>
            Font size — 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36,
            48, 72. Same ladder Microsoft Word uses, so copy-paste between
            the two stays consistent.
          </T>
        </li>
        <li>
          <T>Headings H1 / H2 / H3 and a paragraph reset.</T>
        </li>
        <li>
          <T>Bulleted list, numbered list, blockquote, inline code.</T>
        </li>
        <li>
          <T>Link — paste any URL; clear the field to remove the link.</T>
        </li>
        <li>
          <T>Undo / Redo.</T>
        </li>
        <li>
          <T>
            AI assistant — opens a popover with similar-document lookup,
            grammar check and reading-level analysis. See the AI assistant
            page for details.
          </T>
        </li>
      </ul>

      <h2>
        <T>Autosave &amp; versions</T>
      </h2>
      <p>
        <T>
          There is no Save button. Every keystroke is debounced and persisted
          in the background — the small status line under the editor reads
          Saving… and then Saved at HH:MM. If the network drops the indicator
          shows an error and retries automatically.
        </T>
      </p>
      <p>
        <T>
          Immutable version snapshots are stamped at meaningful moments —
          when you Send to review, when an admin Approves, and when an
          admin restores a previous version. A change-summary field appears
          next to Send to review so reviewers see what changed at a glance.
        </T>
      </p>

      <h2>
        <T>Realtime co-editing</T>
      </h2>
      <p>
        <T>
          When two or more people open the same document, a Live indicator
          and a row of avatars appear above the toolbar. Everyone sees each
          other&apos;s cursor and edits as they happen, and status changes
          (Send to review / Approve / Reject) propagate to every connected
          tab instantly with a small toast.
        </T>
      </p>
    </>
  );
}
