import { T } from "@/components/T";

export default function HelpAIAssistant() {
  return (
    <>
      <h1>
        <T>AI assistant</T>
      </h1>
      <p>
        <T>
          The AI button on the right edge of the toolbar (the one with the
          sparkles icon) opens a popover with three on-demand tools. Nothing
          runs automatically — you click the action you want, the result
          appears, and the popover closes when you press Escape, click
          outside, or click the small × in the header.
        </T>
      </p>

      <h2>
        <T>Similar documents</T>
      </h2>
      <p>
        <T>
          Click Find. The first 500 characters of the current document are
          sent to /api/ai/similar, which returns a short list of existing
          Volt documents that look topically related. Each result is a link
          straight to the document, with its type and status pill so you
          can see at a glance whether it&apos;s a draft, in review or
          approved. Useful before drafting to avoid duplication.
        </T>
      </p>

      <h2>
        <T>Grammar &amp; spelling</T>
      </h2>
      <p>
        <T>
          Click Check. The plain-text version of the document is sent to
          LanguageTool (self-hosted in the EU stack) via /api/ai/grammar,
          which returns up to 10 suggestions: a short message, the
          recommended replacement, and the surrounding context so you can
          locate the issue. The language defaults to the document&apos;s
          original language.
        </T>
      </p>

      <h2>
        <T>Reading level (CEFR)</T>
      </h2>
      <p>
        <T>
          Click Analyze. The CEFR estimator at /api/ai/cefr returns the
          document&apos;s level (A1 → C2), a 0-100 score, the average
          sentence length, and the share of long words. Aim for B1-B2 for
          public-facing text — that&apos;s readable by most adult speakers
          without dropping nuance.
        </T>
      </p>

      <h2>
        <T>Privacy &amp; provider notes</T>
      </h2>
      <ul>
        <li>
          <T>
            All AI calls are explicit, on-click. The editor never auto-sends
            document content to a third party.
          </T>
        </li>
        <li>
          <T>
            Drafting (when configured) routes through Mistral via La
            Plateforme — France-based. DeepL (Germany) handles translation.
            LanguageTool runs self-hosted on the same VPS as the database.
            CEFR analysis is in-process. No data leaves the EU.
          </T>
        </li>
        <li>
          <T>
            On documents with status draft or review, AI calls respect the
            same RLS visibility as comments — content that would be private
            to a draft owner doesn&apos;t get shipped to a provider that the
            owner&apos;s readers couldn&apos;t see.
          </T>
        </li>
      </ul>
    </>
  );
}
