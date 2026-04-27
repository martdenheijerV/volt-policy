import { T } from "@/components/T";

export default function HelpCreateDocument() {
  return (
    <>
      <h1>
        <T>Create a document</T>
      </h1>
      <p>
        <T>Editors and admins can create new policy documents.</T>
      </p>
      <h2>
        <T>Required prefix information</T>
      </h2>
      <ul>
        <li>
          <T>Title — concise, used as the slug for public URLs.</T>
        </li>
        <li>
          <T>Type — policy, position, resolution, statement, motion.</T>
        </li>
        <li>
          <T>Language — original language of the document.</T>
        </li>
        <li>
          <T>Purpose — one sentence about why this exists.</T>
        </li>
        <li>
          <T>Tags — comma-separated topical labels (e.g. climate, eu).</T>
        </li>
      </ul>
      <h2>
        <T>Body editing</T>
      </h2>
      <p>
        <T>
          The editor supports headings, bold, italic, underline, lists,
          quotes, code, and links. Per the Volt brand guidelines, only
          structural formatting is allowed — colors and fonts are restricted
          to keep the library visually consistent.
        </T>
      </p>
      <h2>
        <T>Saving versions</T>
      </h2>
      <p>
        <T>
          Each Save new version click writes an immutable snapshot with your
          change summary. Documents in review or approved status require a
          non-empty change summary.
        </T>
      </p>
    </>
  );
}
