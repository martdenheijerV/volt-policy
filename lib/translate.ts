import { withUser } from "./db/sql";

/**
 * Auto-translation cache layer. The table `document_translations` is reused
 * as cache: rows are keyed on `(document_id, language)` and store the title
 * + content for that language plus the source version that was translated.
 *
 * When a user views a doc in a non-source language:
 *   1. We look up the cached translation.
 *   2. If absent or stale (source_version != current document version) we
 *      call DeepL via the existing /api/translate route, save the result,
 *      and return it.
 *   3. Otherwise we serve the cache.
 *
 * If `DEEPL_API_KEY` is not configured the helper returns the source as-is
 * (UI shows a small note that auto-translation is disabled).
 */

export interface TranslatedDoc {
  title: string;
  content: string;
  language: string;
  isOriginal: boolean;
  isMachine: boolean;
  sourceLanguage: string;
}

const DEEPL_LANG_MAP: Record<string, string> = {
  en: "EN",
  nl: "NL",
  de: "DE",
  fr: "FR",
  it: "IT",
  es: "ES",
  pt: "PT",
  pl: "PL",
};

function toDeepLLang(lang: string): string | null {
  const code = lang.toLowerCase();
  return DEEPL_LANG_MAP[code] ?? null;
}

async function callDeepL(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return text;

  const target = toDeepLLang(targetLang);
  if (!target) return text;
  const source = sourceLang ? toDeepLLang(sourceLang) : undefined;

  const isFree = key.endsWith(":fx");
  const endpoint = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const params: Record<string, string> = {
    text,
    target_lang: target,
    tag_handling: "html",
  };
  if (source) params.source_lang = source;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });
    if (!res.ok) {
      console.error("[translate] DeepL HTTP error", res.status, await res.text());
      return text;
    }
    const data = (await res.json()) as { translations?: { text: string }[] };
    return data.translations?.[0]?.text ?? text;
  } catch (e) {
    console.error("[translate] DeepL call failed:", e);
    return text;
  }
}

/**
 * Fetch a document rendered in `lang`. If `lang` matches the doc's source
 * language we return the original. Otherwise we serve from cache or
 * translate on demand.
 */
export async function getDocInLanguage(input: {
  documentId: string;
  sourceLanguage: string;
  sourceTitle: string;
  sourceContent: string;
  sourceVersion: number;
  targetLanguage: string;
}): Promise<TranslatedDoc> {
  const target = input.targetLanguage.toLowerCase();
  const source = input.sourceLanguage.toLowerCase();

  if (target === source) {
    return {
      title: input.sourceTitle,
      content: input.sourceContent,
      language: source,
      isOriginal: true,
      isMachine: false,
      sourceLanguage: source,
    };
  }

  // Try cache
  const cached = await withUser(null, async (tx) => {
    return await tx<{ title: string; content: string; source_version: number; status: string }[]>`
      select title, content, source_version, status
      from document_translations
      where document_id = ${input.documentId} and language = ${target}
      limit 1
    `;
  });

  if (cached.length > 0 && cached[0].source_version === input.sourceVersion) {
    return {
      title: cached[0].title,
      content: cached[0].content,
      language: target,
      isOriginal: false,
      isMachine: cached[0].status === "machine",
      sourceLanguage: source,
    };
  }

  // Cache miss or stale → translate now
  const translatedTitle = await callDeepL(input.sourceTitle, target, source);
  const translatedContent = await callDeepL(input.sourceContent, target, source);

  // Upsert into cache
  try {
    await withUser(null, async (tx) => {
      // Casts to public.translation_status are explicit because the
      // postgres driver passes literals as TEXT, and the enum column
      // refuses an implicit text→enum coercion. Without these casts
      // every doc page that triggers a translation cache write logs:
      //   column "status" is of type translation_status but expression
      //   is of type text
      await tx`
        insert into document_translations
          (document_id, language, source_version, title, content, status)
        values
          (${input.documentId}, ${target}, ${input.sourceVersion},
           ${translatedTitle}, ${translatedContent},
           'machine'::public.translation_status)
        on conflict (document_id, language) do update set
          source_version = excluded.source_version,
          title = excluded.title,
          content = excluded.content,
          status = case
            when document_translations.status = 'verified'::public.translation_status
              then 'verified'::public.translation_status
            else 'machine'::public.translation_status
          end,
          updated_at = now()
      `;
    });
  } catch (e) {
    // Cache write failure should never block the read.
    console.error("[translate] cache upsert failed:", e);
  }

  return {
    title: translatedTitle,
    content: translatedContent,
    language: target,
    isOriginal: false,
    isMachine: true,
    sourceLanguage: source,
  };
}
