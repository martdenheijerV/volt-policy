import { withUser } from "@/lib/db/sql";
import { DICTIONARIES, SUPPORTED_LANGUAGES, type Lang } from "./dictionaries";

/**
 * Lazy auto-translation for ANY UI string.
 *
 * Resolution order, per (text, target_lang):
 *   1. If `text` looks like a dictionary key (e.g. `nav.dashboard`), look it
 *      up in DICTIONARIES first.
 *   2. If a row exists in `ui_translation_cache`, return that.
 *   3. Otherwise call DeepL, write the result to the cache, return it.
 *
 * Pages call `await t("Recent activity")` and the source English text is
 * both the "key" and the fallback. New languages don't need any code
 * changes — the first render in that language seeds the cache via DeepL.
 *
 * Tags / proper names that should never translate can be left out of the
 * t() wrapper entirely (they render as-is).
 */

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

const inFlight = new Map<string, Promise<string>>();
const memoryCache = new Map<string, string>();

function isDictKey(s: string): boolean {
  return /^[a-z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*$/.test(s);
}

function cacheKey(text: string, lang: string): string {
  return `${lang}::${text}`;
}

async function callDeepL(text: string, lang: string): Promise<string> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return text;
  const target = DEEPL_LANG_MAP[lang];
  if (!target) return text;

  const isFree = key.endsWith(":fx");
  const endpoint = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text,
        source_lang: "EN",
        target_lang: target,
        // Preserve formatting; UI strings rarely contain HTML but this is
        // a safer default than the "html" tag handling.
        preserve_formatting: "1",
      }),
    });
    if (!res.ok) {
      console.error("[i18n.auto] DeepL HTTP", res.status, await res.text());
      return text;
    }
    const data = (await res.json()) as { translations?: { text: string }[] };
    return data.translations?.[0]?.text ?? text;
  } catch (e) {
    console.error("[i18n.auto] DeepL call failed:", e);
    return text;
  }
}

export async function autoTranslate(text: string, lang: string): Promise<string> {
  // Belt-and-braces: any uncaught throw inside this function will surface
  // as an RSC render error in the browser, which on a doc page that
  // re-renders on every nav language flip can lock the user out (Mart
  // saw exactly this — switch language a few times → "client side
  // error" → can't open docs anymore). Wrap the whole pipeline in a
  // single try/catch and fall back to the source string. We always
  // return *something*.
  try {
    return await autoTranslateInner(text, lang);
  } catch (e) {
    console.error("[i18n.auto] autoTranslate failed, falling back to source:", e);
    return text;
  }
}

async function autoTranslateInner(text: string, lang: string): Promise<string> {
  if (!text) return text;
  const target = lang.toLowerCase();
  if (target === "en") return text; // English is the source

  // 1. Dict lookup if it looks like a key
  if (isDictKey(text)) {
    const supportedTarget = (SUPPORTED_LANGUAGES as readonly string[]).includes(target)
      ? (target as Lang)
      : "en";
    const fromDict = DICTIONARIES[supportedTarget][text] ?? DICTIONARIES.en[text];
    if (fromDict) return fromDict;
  } else {
    const supportedTarget = (SUPPORTED_LANGUAGES as readonly string[]).includes(target)
      ? (target as Lang)
      : null;
    // Free shortcut: if the source text happens to match a dict value in
    // English, prefer the curated translation.
    if (supportedTarget) {
      const dictEntry = Object.entries(DICTIONARIES.en).find(([, v]) => v === text);
      if (dictEntry) {
        const [k] = dictEntry;
        const translated = DICTIONARIES[supportedTarget][k];
        if (translated) return translated;
      }
    }
  }

  // 2. In-memory cache (per process)
  const memKey = cacheKey(text, target);
  const memHit = memoryCache.get(memKey);
  if (memHit !== undefined) return memHit;

  // Coalesce concurrent requests for the same (text, lang) pair so we make
  // at most one DeepL call per cache miss.
  const pending = inFlight.get(memKey);
  if (pending) return pending;

  const promise = (async () => {
    // 3. DB cache
    try {
      const rows = await withUser(null, async (tx) => {
        return await tx<{ translated: string }[]>`
          select translated from ui_translation_cache
          where source_text = ${text} and target_lang = ${target}
          limit 1
        `;
      });
      if (rows.length > 0) {
        memoryCache.set(memKey, rows[0].translated);
        return rows[0].translated;
      }
    } catch (e) {
      console.error("[i18n.auto] DB cache read failed:", e);
    }

    // 4. DeepL
    const translated = await callDeepL(text, target);
    memoryCache.set(memKey, translated);

    // 5. Persist (best effort)
    try {
      await withUser(null, async (tx) => {
        await tx`
          insert into ui_translation_cache (source_text, target_lang, translated)
          values (${text}, ${target}, ${translated})
          on conflict (source_text, target_lang) do nothing
        `;
      });
    } catch (e) {
      console.error("[i18n.auto] DB cache write failed:", e);
    }

    return translated;
  })();

  inFlight.set(memKey, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(memKey);
  }
}
