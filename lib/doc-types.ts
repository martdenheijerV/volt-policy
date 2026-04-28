/**
 * Doc-type metadata + label resolution.
 *
 * The DocType enum lives in `lib/types.ts` next to the rest of the model
 * types. This file is the user-facing surface: the English label every
 * type renders as in the UI, plus a small helper that auto-translates it
 * via the i18n layer (DeepL + dict cache; first hit per (label, lang)
 * pair pays the network, the rest is free).
 *
 * When we add another doc-type to the enum (touchstone, eo_speech, …)
 * we add it here and to migration 008's `add value if not exists` block.
 * The selector in /documents/new picks them up automatically because it
 * iterates DOC_TYPES.
 */

import { DOC_TYPES, type DocType } from "./types";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: "Policy",
  position: "Position",
  resolution: "Resolution",
  statement: "Statement",
  motion: "Motion",
  touchstone: "Touchstone",
  roadmap_europe: "Roadmap (Europe)",
  roadmap_national: "Roadmap (national)",
  roadmap_local: "Roadmap (local)",
  electoral_programme_europe: "Electoral programme (Europe)",
  electoral_programme_national: "Electoral programme (national)",
  electoral_programme_local: "Electoral programme (local)",
  campaign_programme_europe: "Electoral campaign programme (Europe)",
  campaign_programme_national: "Electoral campaign programme (national)",
  campaign_programme_local: "Electoral campaign programme (local)",
  best_practice: "Best practice assessment",
  eo_speech: "EO speech",
  other: "Other",
};

export function docTypeLabel(t: DocType | string): string {
  return DOC_TYPE_LABELS[t as DocType] ?? t;
}

export { DOC_TYPES, type DocType };
