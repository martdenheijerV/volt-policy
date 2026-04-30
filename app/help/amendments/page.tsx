import { T } from "@/components/T";

export default function HelpAmendments() {
  return (
    <>
      <h1>
        <T>Amendments</T>
      </h1>
      <p>
        <T>
          Amendments are formal change proposals. They live in the
          Amendments tab of a document and exist alongside (not instead of)
          inline comments — comments are conversation, amendments are
          concrete edits up for a vote.
        </T>
      </p>

      <h2>
        <T>Proposing an amendment</T>
      </h2>
      <ol>
        <li>
          <T>
            Open the Amendments tab on the document and click + New
            amendment.
          </T>
        </li>
        <li>
          <T>
            Paste or type the exact passage you want to change in Target
            quote. The system pins it to the document version you&apos;re
            looking at, so later edits to the original don&apos;t silently
            move your amendment.
          </T>
        </li>
        <li>
          <T>
            Type the proposed Replacement text. Leave it empty if your
            proposal is to delete the passage.
          </T>
        </li>
        <li>
          <T>
            Optionally add a Rationale — one or two sentences explaining
            why. This is what other members see while deciding whether to
            support.
          </T>
        </li>
      </ol>

      <h2>
        <T>Supporting</T>
      </h2>
      <p>
        <T>
          Any member with read access to the document can click Support on
          an amendment. Support counts are visible in the list, and a
          per-amendment threshold can be configured by admins in the
          document&apos;s settings (default: simple majority of editors).
        </T>
      </p>

      <h2>
        <T>Accepting or rejecting</T>
      </h2>
      <p>
        <T>
          The document owner or an admin decides each amendment&apos;s fate:
        </T>
      </p>
      <ul>
        <li>
          <T>
            Accept — applies the replacement to the live document and
            stamps a new version. The amendment is closed with status
            accepted; the audit log records who accepted it.
          </T>
        </li>
        <li>
          <T>
            Reject — closes the amendment with a short reason. The original
            text stays untouched.
          </T>
        </li>
      </ul>

      <h2>
        <T>If the target passage is gone</T>
      </h2>
      <p>
        <T>
          When the live document no longer contains the amendment&apos;s
          target quote (someone edited it out), the amendment is shown with
          an Original passage gone label and cannot be accepted. The
          proposer can rewrite it against the current text or withdraw it.
        </T>
      </p>
    </>
  );
}
