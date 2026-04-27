import { T } from "@/components/T";

export default function HelpAmendments() {
  return (
    <>
      <h1>
        <T>Amendments</T>
      </h1>
      <p>
        <T>
          Members can propose changes to a document via the Amendments tab.
          Each amendment includes:
        </T>
      </p>
      <ul>
        <li>
          <T>The exact passage being changed (target quote).</T>
        </li>
        <li>
          <T>The replacement text.</T>
        </li>
        <li>
          <T>An optional rationale.</T>
        </li>
      </ul>
      <p>
        <T>
          Other members can support amendments. Owners or admins decide
          whether to accept or reject them.
        </T>
      </p>
      <p>
        <T>
          Accepted amendments produce a new document version with the
          proposed replacement applied to the target quote.
        </T>
      </p>
    </>
  );
}
