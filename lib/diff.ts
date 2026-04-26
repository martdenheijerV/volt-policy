/**
 * Tiny LCS-based line diff used for the version compare view.
 * Returns an array of {type, line} where type is 'eq' | 'add' | 'del'.
 */
export type DiffOp = { type: "eq" | "add" | "del"; line: string };

export function lineDiff(a: string, b: string): DiffOp[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const m = aLines.length;
  const n = bLines.length;

  // LCS DP table — int[][]
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: "eq", line: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", line: aLines[i++] });
    } else {
      out.push({ type: "add", line: bLines[j++] });
    }
  }
  while (i < m) out.push({ type: "del", line: aLines[i++] });
  while (j < n) out.push({ type: "add", line: bLines[j++] });
  return out;
}

/** Extract a plain-text representation of HTML for diffing. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h\d|li|tr|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}
