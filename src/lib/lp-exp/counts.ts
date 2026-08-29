/** W3-B — the hosted LP experiment's COUNTER model: pure types, retention rules and
 *  the fold from daily rows to per-arm totals. Framework-free and store-free, so the
 *  sync step's arithmetic is unit-testable without any I/O.
 *
 *  PRIVACY IS THE SCHEMA — copied deliberately from the organic ledger
 *  (`organic-channels/outcomes.ts`) and from `analytics/store.ts` before it. A counted
 *  view is `(experiment, arm, UTC day, project) → +1` and nothing else. No IP, no user
 *  agent, no referrer, no cookie, no session, no per-visitor row. There is no row a
 *  visitor could be recovered from because there is no row about a visitor, and there
 *  is nothing here that could later be repurposed into tracking without adding a
 *  column somebody would have to justify.
 *
 *  `project_id` rides every row for exactly one reason: the delete cascade must be
 *  able to find them. It is not a query key for the public path, which addresses rows
 *  by experiment and arm alone. */

/** Which of the two counters a bump moves. Deliberately a closed union rather than a
 *  free string: the column set is the privacy posture, and "add a counter" should
 *  require editing this line. */
export type LpCountKind = "views" | "conversions";

/** One aggregated counter row: what one arm did on one UTC day. */
export interface LpArmCountDay {
  experimentId: string;
  armId: string;
  /** UTC calendar day, "YYYY-MM-DD" */
  day: string;
  views: number;
  conversions: number;
}

/** How long a daily counter row is kept. Six months is longer than any window the
 *  product reads and long enough that a slow experiment (a B2B landing page can take
 *  a quarter to reach its required sample size — see `requiredSampleSize`) is not
 *  quietly truncated mid-test, while still bounding the table.
 *
 *  It is also the honest ceiling on the numbers: the sync step recomputes totals FROM
 *  the retained rows, so an experiment left running for longer than this reports the
 *  traffic of its last 180 days, not of all time. That is a number that can go down,
 *  which is what makes it trustworthy — see the rollup step's rationale. */
export const LP_COUNT_RETENTION_DAYS = 180;

/** UTC calendar day of an instant, "YYYY-MM-DD" — the counter's key third. */
export function lpUtcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** The day BEFORE which counter rows may be dropped. */
export function lpRetentionCutoff(at: Date): string {
  return lpUtcDay(new Date(at.getTime() - LP_COUNT_RETENTION_DAYS * 86_400_000));
}

/** Per-arm totals over a set of daily rows — the exact numbers the sync step writes
 *  onto the experiment's variants.
 *
 *  Rows are summed, never trusted: a negative or non-finite count (a corrupted
 *  document, a backend that returned a string) folds to 0 rather than subtracting
 *  from a real total. Rows for arms the caller did not ask about are kept — the
 *  caller reads back only the ids it knows, and an arm that was renamed away still
 *  has its rows counted under its own id until retention takes them. */
export function foldArmTotals(
  rows: readonly LpArmCountDay[]
): Map<string, { views: number; conversions: number }> {
  const out = new Map<string, { views: number; conversions: number }>();
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
  for (const row of rows) {
    if (!row.armId) continue;
    const cur = out.get(row.armId) ?? { views: 0, conversions: 0 };
    cur.views += n(row.views);
    cur.conversions += n(row.conversions);
    out.set(row.armId, cur);
  }
  return out;
}
