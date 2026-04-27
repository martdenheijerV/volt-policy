import { T } from "@/components/T";

export default function HelpComments() {
  return (
    <>
      <h1>
        <T>Anchored comments</T>
      </h1>
      <p>
        <T>
          Comments can be anchored to specific words. Anchored comments
          appear as yellow highlights in the document body.
        </T>
      </p>
      <ol>
        <li>
          <T>Select the words you want to comment on.</T>
        </li>
        <li>
          <T>
            Click 💬 Comment on selection in the toolbar (or in the read-only
            viewing bar for non-editors).
          </T>
        </li>
        <li>
          <T>
            Type your comment and click Post. The comment shows the anchored
            quote in the panel and a yellow highlight in the document.
          </T>
        </li>
        <li>
          <T>
            Click any comment in the panel to scroll to and flash the
            anchored text. Click any highlight to focus the matching comment.
          </T>
        </li>
        <li>
          <T>
            Resolve comments to remove the highlight and move them to the
            Resolved section.
          </T>
        </li>
      </ol>
    </>
  );
}
