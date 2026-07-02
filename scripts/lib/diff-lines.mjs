/** Tiny pure line-diff for the LLM contract eval (scripts/llm-eval.mjs).
 *
 *  When a golden drifts, the failure must SHOW what changed (system prompt,
 *  schema) instead of two opaque fingerprints. Prompts and schemas here are
 *  short, so a classic O(n·m) LCS over lines is plenty. Framework- and
 *  I/O-free (unit-tested in test-unit/diff-lines.test.mjs).
 */

/** Line-level diff: returns [{ type: "same"|"add"|"del", line }]. */
export function diffLines(oldText, newText) {
  const a = String(oldText ?? "").split("\n");
  const b = String(newText ?? "").split("\n");
  const n = a.length;
  const m = b.length;

  // LCS length table.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", line: a[i] });
      i++;
    } else {
      out.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", line: a[i++] });
  while (j < m) out.push({ type: "add", line: b[j++] });
  return out;
}

/** Render a diff with -/+ markers, keeping unchanged lines for context only
 *  when the text is short; long unchanged runs collapse to "  …". */
export function formatDiff(entries, { maxSameRun = 2 } = {}) {
  const lines = [];
  let sameRun = 0;
  for (const e of entries) {
    if (e.type === "same") {
      sameRun++;
      if (sameRun <= maxSameRun) lines.push(`      ${e.line}`);
      else if (sameRun === maxSameRun + 1) lines.push("      …");
      continue;
    }
    sameRun = 0;
    lines.push(`    ${e.type === "del" ? "-" : "+"} ${e.line}`);
  }
  return lines.join("\n");
}

/** Recursively key-sort plain objects so JSON.stringify(…, null, 2) yields a
 *  stable, diffable multi-line rendering (arrays keep their order). */
export function sortKeysDeep(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
  return out;
}
