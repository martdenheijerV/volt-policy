import { T } from "@/components/T";

export default function HelpComments() {
  return (
    <>
      <h1>
        <T>Comments</T>
      </h1>
      <p>
        <T>
          Comments live in the right-hand column next to the document. Two
          modes: anchored — each thread floats next to the passage it refers
          to — and Show all reactions, which lays the threads out as a flat
          stack in the same column.
        </T>
      </p>

      <h2>
        <T>Anchoring a comment to text</T>
      </h2>
      <ol>
        <li>
          <T>
            Select the words you want to comment on. A small + button appears
            in the right margin at the height of the selection.
          </T>
        </li>
        <li>
          <T>
            Click +. A compose card opens next to the selection with the
            quoted passage above the input field.
          </T>
        </li>
        <li>
          <T>
            Type your comment, optionally tag it as Review or Suggestion, and
            click Post. The passage gets a yellow highlight, and the thread
            takes its position in the column.
          </T>
        </li>
        <li>
          <T>
            Click any highlight to focus the matching thread; click any
            thread to scroll to and briefly flash the passage.
          </T>
        </li>
      </ol>
      <h3>
        <T>Why duplicates work correctly now</T>
      </h3>
      <p>
        <T>
          When you comment on the second occurrence of a repeated word —
          e.g. the second &quot;Maastricht&quot; in a paragraph that mentions
          it three times — only that second occurrence gets highlighted. The
          editor records a small unique window of surrounding text along
          with the selected word, so the matcher can find exactly the spot
          you meant even though the word itself isn&apos;t unique.
        </T>
      </p>

      <h2>
        <T>Replying &amp; resolving</T>
      </h2>
      <ul>
        <li>
          <T>
            Antwoorden / Reply opens an inline reply form under the parent
            thread. Replies stack vertically and scroll with the thread.
          </T>
        </li>
        <li>
          <T>
            Sluit / Close collapses the thread back to its summary line.
          </T>
        </li>
        <li>
          <T>
            Resolve removes the highlight from the document and moves the
            thread into the Resolved section at the bottom of the column.
            Resolved threads can be reopened.
          </T>
        </li>
      </ul>

      <h2>
        <T>Show all reactions</T>
      </h2>
      <p>
        <T>
          The Toon alle reacties / Show all reactions pill, fixed near the AI
          button, switches the column from anchored to flat list. Use this
          to skim every open thread without scrolling the document. The pill
          stays visible as you scroll — it morphs into the toolbar position
          and back as the toolbar sticks.
        </T>
      </p>

      <h2>
        <T>Orphaned comments</T>
      </h2>
      <p>
        <T>
          If the original anchored passage gets deleted from the document,
          the thread disappears from anchored mode (there&apos;s no text to
          anchor it to) but stays visible in Show all reactions, labelled
          Original content deleted. Resolve it, or restore the text — both
          options re-attach or close out the thread cleanly.
        </T>
      </p>

      <h2>
        <T>Realtime updates</T>
      </h2>
      <p>
        <T>
          Adding, replying to or resolving a comment is broadcast to every
          tab on the same document. Everyone sees new threads appear without
          a page refresh.
        </T>
      </p>
    </>
  );
}
