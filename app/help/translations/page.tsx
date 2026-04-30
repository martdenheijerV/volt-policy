import { T } from "@/components/T";

export default function HelpTranslations() {
  return (
    <>
      <h1>
        <T>Translations</T>
      </h1>
      <p>
        <T>
          Each document can have one translation per language. Translations
          are bound to a specific source version, so reviewers can always
          see which version of the original a translation reflects — and
          flag a translation as out of date when the original moves on.
        </T>
      </p>

      <h2>
        <T>Side-by-side editor</T>
      </h2>
      <p>
        <T>
          Open the Translations tab on a document and pick a target
          language. The translator view splits the screen: the source text
          (read-only) on the left, the translation (editable) on the right.
          The same word-style A4 page, font sizes and live presence apply
          to the right column. Autosave runs the same way it does on the
          original.
        </T>
      </p>

      <h2>
        <T>Status</T>
      </h2>
      <ul>
        <li>
          <T>
            machine — the initial draft produced by DeepL. Hidden from the
            public library.
          </T>
        </li>
        <li>
          <T>
            in_review — a human translator is checking it. Still hidden
            publicly.
          </T>
        </li>
        <li>
          <T>
            verified — approved for public consumption. Appears at
            /library/&lt;slug&gt;?lang=&lt;code&gt; alongside the original.
          </T>
        </li>
      </ul>

      <h2>
        <T>Machine translation</T>
      </h2>
      <p>
        <T>
          The Translate with DeepL button asks the DeepL API (Germany,
          configured server-side via DEEPL_API_KEY) to fill the right
          column with a draft. Without a key, the action degrades to a
          stub that copies the source — translators can then write the
          translation manually.
        </T>
      </p>

      <h2>
        <T>Out-of-date warnings</T>
      </h2>
      <p>
        <T>
          When a new version of the original document is approved, every
          existing translation is marked Source updated until a translator
          reviews and re-verifies. Library visitors viewing the translated
          version see a discreet banner pointing them at the more recent
          original.
        </T>
      </p>
    </>
  );
}
