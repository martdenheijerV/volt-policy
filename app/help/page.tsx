import { T } from "@/components/T";

export default function HelpHome() {
  return (
    <>
      <h1>
        <T>Welcome to Volt Policy</T>
      </h1>
      <p>
        <T>
          Volt Policy is the single source of truth for every Volt political
          document — policies, positions, resolutions, statements and motions.
          One place to draft, review, approve, translate, export and publish,
          with the public library as the natural extension of the same data.
        </T>
      </p>
      <h2>
        <T>What it feels like to use</T>
      </h2>
      <p>
        <T>
          The editor behaves like a familiar word processor: an A4 page on a
          grey desk, a sticky formatting toolbar at the top, and a comments
          column on the right. There is no separate title field — whatever
          you style as your first heading becomes the document&apos;s title in
          the dashboard and library URL. Everything you type is saved
          continuously in the background; you never click Save.
        </T>
      </p>
      <h2>
        <T>Getting started in 60 seconds</T>
      </h2>
      <ol>
        <li>
          <T>
            From the dashboard click + New document. Pick a type, language and
            purpose — the body starts empty.
          </T>
        </li>
        <li>
          <T>
            Write. Use the toolbar for headings, font size, lists, links, and
            so on. Autosave catches every keystroke; an immutable version is
            stamped each time you transition the document&apos;s status.
          </T>
        </li>
        <li>
          <T>
            Select any passage and click the floating + in the right margin to
            anchor a comment to it. Reviewers can reply inline. Open the AI
            assistant from the toolbar for similar-document lookup, grammar
            check and CEFR readability analysis.
          </T>
        </li>
        <li>
          <T>
            When the draft is ready, click Send to review. After approval the
            document appears at /library/&lt;slug&gt; with no login required.
          </T>
        </li>
      </ol>
      <h2>
        <T>Where things live</T>
      </h2>
      <ul>
        <li>
          <T>
            Dashboard — your queue: documents you can edit, drafts in review,
            recent activity.
          </T>
        </li>
        <li>
          <T>
            Documents — everyone&apos;s drafts and reviews you have access to,
            filtered by your role and group memberships.
          </T>
        </li>
        <li>
          <T>
            Library — the public face. Approved documents are readable here
            without an account.
          </T>
        </li>
        <li>
          <T>
            Settings → Profile, Groups, Metadata fields, Audit log (admin
            only).
          </T>
        </li>
      </ul>
      <h2>
        <T>Need a specific workflow?</T>
      </h2>
      <p>
        <T>Use the menu on the left to jump to a guide.</T>
      </p>
    </>
  );
}
