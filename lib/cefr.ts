/**
 * Naïve CEFR (A1–C2) estimator for English text.
 * Uses a small word list bucketed by level + sentence length to score readability.
 * Replace with mock-cminor or a calibrated service for production.
 */

// A1/A2 are the most common ~500-1000 English words. We bias toward small lists
// so that long uncommon words drift the score upward.
const A1_A2 = new Set(
  `the of and to a in is for on with at by from as it that this be have has had do does did will would can could may must should about into out up down more most some any all if not no yes you we they i he she me him her us them my your his hers ours theirs which what who when where why how`
    .split(/\s+/)
);
const B1_B2 = new Set(
  `however therefore moreover although whereas nevertheless consequently approximately significantly substantially considerably particularly explicitly implicitly furthermore notwithstanding`.split(
    /\s+/
  )
);

export interface CefrResult {
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  score: number;
  avgSentenceLength: number;
  longWordRatio: number;
}

export function estimateCEFR(text: string): CefrResult {
  const stripped = text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const words = stripped.split(/\W+/).filter(Boolean);
  const sentences = stripped.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (!words.length) {
    return { level: "A1", score: 0, avgSentenceLength: 0, longWordRatio: 0 };
  }

  const longWords = words.filter((w) => w.length >= 8).length;
  const longWordRatio = longWords / words.length;
  const a12 = words.filter((w) => A1_A2.has(w)).length;
  const b12 = words.filter((w) => B1_B2.has(w)).length;
  const a12Ratio = a12 / words.length;
  const b12Ratio = b12 / words.length;
  const avgSentenceLength = words.length / Math.max(sentences.length, 1);

  // Heuristic score 0–100; higher = more advanced
  const score =
    Math.min(100, Math.round(
      longWordRatio * 90 +
      avgSentenceLength * 1.2 +
      b12Ratio * 60 -
      a12Ratio * 40
    ));

  let level: CefrResult["level"];
  if (score < 18) level = "A1";
  else if (score < 30) level = "A2";
  else if (score < 45) level = "B1";
  else if (score < 60) level = "B2";
  else if (score < 80) level = "C1";
  else level = "C2";

  return { level, score, avgSentenceLength, longWordRatio };
}
