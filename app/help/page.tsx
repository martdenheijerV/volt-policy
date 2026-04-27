import { T } from "@/components/T";

export default function HelpHome() {
  return (
    <>
      <h1>
        <T>Welcome to Volt Policy</T>
      </h1>
      <p>
        <T>
          Volt Policy is the single source of truth for all Volt political
          documents. It supports drafting, reviewing, approving, translating,
          exporting and publishing policies, positions, resolutions, statements
          and motions.
        </T>
      </p>
      <h2>
        <T>Getting started in 60 seconds</T>
      </h2>
      <ol>
        <li>
          <T>
            From the Documents tab click + New document, give it a title, type
            and purpose, then save.
          </T>
        </li>
        <li>
          <T>
            Edit the body using the rich-text toolbar. Every save creates an
            immutable version with your change summary for the audit trail.
          </T>
        </li>
        <li>
          <T>
            When ready, click Send to review. Other members can comment,
            propose amendments, or translate.
          </T>
        </li>
        <li>
          <T>
            An admin approves the document, which makes it appear in the
            public library at /library.
          </T>
        </li>
      </ol>
      <h2>
        <T>Looking for something specific?</T>
      </h2>
      <p>
        <T>Use the menu on the left to jump to a workflow guide.</T>
      </p>
    </>
  );
}
