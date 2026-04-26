export default function HelpTranslations() {
  return (
    <>
      <h1>Translations</h1>
      <p>
        Each document can have one translation per language. Translations are
        bound to a specific source version, so reviewers can see exactly which
        version of the original was translated.
      </p>
      <h2>Status</h2>
      <ul>
        <li><strong>machine</strong> — produced via DeepL or similar.</li>
        <li><strong>in_review</strong> — a translator is reviewing.</li>
        <li><strong>verified</strong> — approved for public consumption.</li>
      </ul>
      <h2>Side-by-side editor</h2>
      <p>
        Translators see the source text and the translated text in two columns.
        Saving updates the translation status and the audit trail.
      </p>
      <p>
        DeepL is supported via an admin-configured API key
        (<code>DEEPL_API_KEY</code>). Without a key, translations must be
        entered manually.
      </p>
    </>
  );
}
