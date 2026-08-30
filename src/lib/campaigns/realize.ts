/** Realized impact of an APPLIED change-set: what the touched campaigns actually
 *  did in the 7 days after the apply, versus the 7 before it. Pure — no I/O, no
 *  React; the runner (./realize-run) supplies the already-persisted per-campaign
 *  daily series and writes the result back.
 *
 *  This is the first projected-vs-realized comparison in the codebase, so a note
 *  on what it deliberately is NOT: it is not an experiment. Nothing here claims
 *  the delta was CAUSED by the change-set — the account moved for many reasons in
 *  those 14 days. It is the honest observable: the projection said +X, the
 *  touched campaigns then did +Y, and the operator (and the calibration in
 *  ./calibration) gets to see the gap instead of only ever seeing forecasts. */
import type { ChangeSet, RealizedImpact } from "./control-plane-types";
import { projectedValueGain } from "./control-plane-types";
import type { DailyPoint } from "./types";

/** Days on each side of the apply that are compared. 7 — a whole week on both
 *  sides, so weekday seasonality cancels rather than being compared away. */
export const REALIZE_WINDOW_DAYS = 7;

/** How many of the {@link REALIZE_WINDOW_DAYS} each window must actually be
 *  covered by the stored series before the measurement is trusted. 5 of 7 leaves
 *  room for the odd zero-delivery gap at the edges without letting a window that
 *  has largely rolled out of the stored period masquerade as a measurement. */
export const REALIZE_MIN_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC calendar day (YYYY-MM-DD) a timestamp falls on — the same key space
 *  `DailyPoint.date` uses, so window membership is a string comparison. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The `count` consecutive day keys starting at `startMs`, as a set. */
function dayWindow(startMs: number, count: number): Set<string> {
  const days = new Set<string>();
  for (let i = 0; i < count; i++) days.add(dayKey(startMs + i * DAY_MS));
  return days;
}

/** The campaigns a change-set touched: every donor, plus every recipient of a
 *  SHIFT. A pause has no recipient (`toId` stays empty), so it contributes its
 *  donor only — measuring a blank id would silently pull the whole account's
 *  un-keyed series into the sums. Order-stable and de-duplicated, so the stored
 *  `campaigns` array reads the same way twice. */
export function touchedCampaignIds(moves: ChangeSet["moves"]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const m of moves) {
    push(m.fromId);
    // WP S1b — `push` already ignores an empty id, but the guard is stated: the two
    // criterion kinds carry no recipient CAMPAIGN (a promote's ad group rides in
    // `toName`, never in `toId`), so there is nothing here for the realized-impact
    // window to measure on the far side.
    if (m.kind !== "pause" && m.toId) push(m.toId);
  }
  return ids;
}

interface WindowSums {
  cost: number;
  value: number;
}

function sumWindow(points: DailyPoint[] | undefined, days: Set<string>): WindowSums {
  let cost = 0;
  let value = 0;
  for (const p of points ?? []) {
    if (!days.has(p.date)) continue;
    cost += p.cost;
    value += p.conversionValue;
  }
  return { cost, value };
}

/** How many distinct days of `days` the touched campaigns' series covers at all.
 *
 *  Coverage is a property of the stored PERIOD, not of any one campaign: the
 *  per-campaign series doc is overwritten wholesale on every sync from one
 *  date-segmented fetch, so a date is either inside the synced period or it is
 *  not. A campaign with genuinely zero delivery on a covered day contributes a
 *  truthful 0 to the sums (and often no row at all), which is why this counts the
 *  UNION across the touched set rather than the weakest campaign — the failure
 *  this guards against is the WINDOW falling outside the stored period, which
 *  hits every campaign at once. */
function daysCovered(
  seriesById: Record<string, DailyPoint[]>,
  ids: string[],
  days: Set<string>
): number {
  const hit = new Set<string>();
  for (const id of ids) {
    for (const p of seriesById[id] ?? []) {
      if (days.has(p.date)) hit.add(p.date);
    }
  }
  return hit.size;
}

/**
 * Measure an applied change-set against its own projection, or return null when
 * there is nothing to measure yet.
 *
 * Null (not "insufficient") for: a set that is not `applied` — note there is no
 * `appliedAt` in the model and `approvedAt` is stamped even on a FAILED settle,
 * so status is the only honest filter; a set with no/unparseable `approvedAt`;
 * and a set whose after-window has not fully elapsed. "Not due yet" is not a
 * degradation, so it must not be persisted as one — the next sync will try again.
 *
 * `insufficient` is reserved for the case where the windows ARE due but the
 * stored series cannot cover them.
 */
export function realizeChangeSet(
  cs: Pick<ChangeSet, "status" | "approvedAt" | "moves" | "simulation">,
  seriesById: Record<string, DailyPoint[]>,
  now: number
): RealizedImpact | null {
  if (cs.status !== "applied") return null;
  if (!cs.approvedAt) return null;
  const at = Date.parse(cs.approvedAt);
  if (Number.isNaN(at)) return null;
  if (now < at + REALIZE_WINDOW_DAYS * DAY_MS) return null; // not due yet

  // After = the apply day and the six that follow it; before = the seven that
  // precede the apply day. Day-aligned on both sides so the two windows are the
  // same shape (7 whole days each) regardless of the time of day of the apply.
  const applyDayStart = Date.parse(`${dayKey(at)}T00:00:00.000Z`);
  const after = dayWindow(applyDayStart, REALIZE_WINDOW_DAYS);
  const before = dayWindow(applyDayStart - REALIZE_WINDOW_DAYS * DAY_MS, REALIZE_WINDOW_DAYS);

  const ids = touchedCampaignIds(cs.moves);
  const campaigns = ids.map((id) => {
    const points = seriesById[id];
    const b = sumWindow(points, before);
    const a = sumWindow(points, after);
    return { id, costBefore: b.cost, costAfter: a.cost, valueBefore: b.value, valueAfter: a.value };
  });

  const covered = {
    before: daysCovered(seriesById, ids, before),
    after: daysCovered(seriesById, ids, after),
  };
  const measured = covered.before >= REALIZE_MIN_DAYS && covered.after >= REALIZE_MIN_DAYS;

  const realizedValueDelta = campaigns.reduce((s, c) => s + (c.valueAfter - c.valueBefore), 0);
  const projected = projectedValueGain(cs.simulation);

  return {
    status: measured ? "measured" : "insufficient",
    computedAt: new Date(now).toISOString(),
    windowDays: REALIZE_WINDOW_DAYS,
    daysCovered: covered,
    campaigns,
    realizedValueDelta,
    projectedValueGain: projected,
    // A ratio against a projection of zero-or-worse divides by nothing meaningful,
    // and a ratio over a window we could not cover would be a number dressed up as
    // a measurement. Both read null; the UI shows the delta without the percentage.
    ratio: measured && projected > 0 ? realizedValueDelta / projected : null,
  };
}
