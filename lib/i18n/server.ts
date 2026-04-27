import { cookies } from "next/headers";
import { createClient } from "@/lib/db/client";
import { SUPPORTED_LANGUAGES, type Lang, t as tFn } from "./dictionaries";
import { autoTranslate } from "./auto";

const COOKIE = "volt_lang";

export async function getLang(): Promise<Lang> {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get(COOKIE)?.value;
  if (cookieLang && (SUPPORTED_LANGUAGES as readonly string[]).includes(cookieLang)) {
    return cookieLang as Lang;
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("language_pref")
        .eq("id", user.id)
        .maybeSingle();
      if (
        profile?.language_pref &&
        (SUPPORTED_LANGUAGES as readonly string[]).includes(profile.language_pref)
      ) {
        return profile.language_pref as Lang;
      }
    }
  } catch {
    /* ignore */
  }
  return "en";
}

/**
 * Synchronous t(key) — only resolves curated dictionary keys (e.g. nav.*).
 * Returns the key as fallback if no entry exists. Use this for
 * server-rendered components where async/await is awkward.
 */
export async function getT() {
  const lang = await getLang();
  return {
    lang,
    t: (key: string) => tFn(lang, key),
  };
}

/**
 * Async tr(text) — auto-translates ANY English string via dictionary,
 * DB cache, or DeepL. Use this in server components for strings that
 * don't have a dedicated dictionary key. First call per (text, lang)
 * pair pays the DeepL latency; subsequent calls are cached forever.
 */
export async function getTr() {
  const lang = await getLang();
  return {
    lang,
    tr: async (text: string) => autoTranslate(text, lang),
  };
}
