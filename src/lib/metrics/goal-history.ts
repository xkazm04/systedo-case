/** Direction 2 — the goal gets a memory. The monthly revenue goal was a single
 *  constant measured against EVERY month (see `monthlyAttainmentHistory`), so a
 *  goal that was raised in June retroactively re-judged January as a miss. These
 *  pure primitives give the goal a timeline: an append-only list of dated changes,
 *  each `{ effectiveMonth, goal }`, so every month is scored against the goal that
 *  was actually in force THAT month. Framework-free — the store persists the list;
 *  the attainment scorer resolves it; both share this one canonical shape. */

/** One recorded goal change: from `effectiveMonth` onward (until the next change)
 *  the monthly revenue goal is `goal` CZK. `effectiveMonth` is a YYYY-MM calendar
 *  month (the granularity attainment is scored at). */
export interface GoalChange {
  /** YYYY-MM the goal takes effect (inclusive) */
  effectiveMonth: string;
  /** monthly revenue goal in CZK, in force from `effectiveMonth` onward */
  goal: number;
}

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Keep only well-formed entries (valid YYYY-MM, finite goal > 0), collapse to the
 *  LAST entry per month (a same-month correction wins) and sort ascending. Pure —
 *  the one place raw stored/rebuilt history is made canonical before use. */
export function sanitizeGoalHistory(raw: unknown): GoalChange[] {
  if (!Array.isArray(raw)) return [];
  const byMonth = new Map<string, number>();
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const month = typeof o.effectiveMonth === "string" ? o.effectiveMonth : "";
    const goal = Number(o.goal);
    if (!YM.test(month) || !Number.isFinite(goal) || goal <= 0) continue;
    byMonth.set(month, goal); // later duplicate overwrites → last-per-month wins
  }
  return [...byMonth.entries()]
    .map(([effectiveMonth, goal]) => ({ effectiveMonth, goal }))
    .sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? -1 : 1));
}

/** The monthly revenue goal in force for a given YYYY-MM `month`: the goal of the
 *  latest change whose `effectiveMonth` is ≤ `month`. Months BEFORE the first
 *  recorded change fall back to `fallback` (the current constant goal), so history
 *  with no relevant entry reproduces the pre-memory behaviour exactly. Assumes
 *  `history` is sorted ascending (as `sanitizeGoalHistory` / `recordGoalChange`
 *  return it). */
export function goalForMonth(history: GoalChange[], month: string, fallback: number): number {
  let resolved = fallback;
  for (const e of history) {
    if (e.effectiveMonth <= month) resolved = e.goal;
    else break; // sorted: no later entry can apply
  }
  return resolved;
}

/**
 * Record that from `effectiveMonth` the monthly revenue goal is `goal`. Idempotent
 * by VALUE: if the goal already in force for that month equals `goal` the history
 * is returned unchanged (a same-value save adds nothing), so repeated saves never
 * grow the log. A genuine change upserts the entry for `effectiveMonth` (a within-
 * month correction replaces that month's entry) and returns a fresh, sorted list.
 * Pure — the caller persists the result; `effectiveMonth` must be a YYYY-MM.
 */
export function recordGoalChange(
  history: GoalChange[],
  effectiveMonth: string,
  goal: number
): GoalChange[] {
  const clean = sanitizeGoalHistory(history);
  if (!YM.test(effectiveMonth) || !Number.isFinite(goal) || goal <= 0) return clean;
  // Same value already in force for this month → nothing to record (idempotent).
  if (goalForMonth(clean, effectiveMonth, NaN) === goal) return clean;
  const next = clean.filter((e) => e.effectiveMonth !== effectiveMonth);
  next.push({ effectiveMonth, goal });
  next.sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? -1 : 1));
  return next;
}
