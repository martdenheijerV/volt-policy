import { autoTranslate } from "@/lib/i18n/auto";
import { getLang } from "@/lib/i18n/server";

/**
 * Lazy-translated text. Wrap any English UI string in `<T>...</T>` to have
 * it auto-translated via DeepL (with cache) into the viewer's preferred
 * language. First render pays the DeepL latency; subsequent renders read
 * from `ui_translation_cache`.
 *
 * Use only with literal English strings or composed text — not for
 * user-generated content (titles, names, tags). Document content is
 * translated separately via `lib/translate.ts`.
 *
 * Example:
 *   <h1><T>Recent activity</T></h1>
 *   <p><T>Sign in with your Volt account.</T></p>
 */
export async function T({ children }: { children: string }) {
  if (typeof children !== "string" || !children.trim()) {
    return <>{children}</>;
  }
  const lang = await getLang();
  const translated = await autoTranslate(children, lang);
  return <>{translated}</>;
}
