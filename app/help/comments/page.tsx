export default function HelpComments() {
  return (
    <>
      <h1>Anchored comments</h1>
      <p>
        Comments can be anchored to specific words. Anchored comments appear as
        yellow highlights in the document body.
      </p>
      <ol>
        <li>Select the words you want to comment on.</li>
        <li>
          Click <strong>💬 Comment on selection</strong> in the toolbar (or in
          the read-only viewing bar for non-editors).
        </li>
        <li>
          Type your comment and click <em>Post</em>. The comment shows the
          anchored quote in the panel and a yellow highlight in the document.
        </li>
        <li>
          Click any comment in the panel to scroll to and flash the anchored
          text. Click any highlight to focus the matching comment.
        </li>
        <li>
          Resolve comments to remove the highlight and move them to the
          <em> Resolved</em> section.
        </li>
      </ol>
    </>
  );
}
