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
          are bound to a specific source version, so reviewers can see
          exactly which version of the original was translated.
        </T>
      </p>
      <h2>
        <T>Status</T>
      </h2>
      <ul>
        <li>
          <T>machine — produced via DeepL or similar.</T>
        </li>
        <li>
          <T>in_review — a translator is reviewing.</T>
        </li>
        <li>
          <T>verified — approved for public consumption.</T>
        </li>
      </ul>
      <h2>
        <T>Side-by-side editor</T>
      </h2>
      <p>
        <T>
          Translators see the source text and the translated text in two
          columns. Saving updates the translation status and the audit trail.
        </T>
      </p>
      <p>
        <T>
          DeepL is supported via an admin-configured API key (DEEPL_API_KEY).
          Without a key, translations must be entered manually.
        </T>
      </p>
    </>
  );
}
