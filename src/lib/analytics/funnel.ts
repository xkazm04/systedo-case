/** Funnel readers over the first-party daily counters — the missing consumers
 *  that make the sign-up + activation KPIs computable from RECORDED EVENTS ONLY
 *  (the same posture as activity/publish-rate: pure, framework-free, no clock of
 *  its own, and it NEVER synthesizes a number — a thin window returns an honest
 *  "not enough events" status, not a confident 0 %).
 *
 *  The two KPIs these back (kpi-sim/snapshot.json):
 *   - Sign-in gate conversion  = signups ÷ sign-in-gate views. The gate view is
 *     the anonymous server render of AppSignInGate ("/app-gate"); the signup is
 *     the adapter's one-per-account createUser event. This measures NEW-account
 *     conversion per gate render — deliberately not "sessions", because the app
 *     records no session/cookie identifiers at all.
 *   - Onboarding activation    = activations ÷ signups. The activation is the
 *     one-shot "onboarding checklist first reached all-steps-done" transition.
 */
import type { DailyMetricRow } from "./store";

export const METRIC_SIGNUP = "signup";
export const METRIC_ACTIVATION = "activation";
/** The anonymous render of the /app sign-in wall (AppSignInGate). */
export const GATE_ROUTE = "/app-gate";

/** The public no-account website scan (WP W2-B). Its funnel is the ONLY one in the
 *  product that starts before an account exists, which is exactly why it is worth
 *  counting separately from the sign-in gate: a visitor who scans and leaves is a
 *  different failure from one who never scanned at all. */
export const SKEN_ROUTE = "/sken";
/** A scan actually ran on the public mode (counted server-side, per generation). */
export const METRIC_SKEN_SCAN = "sken-scan";
/** A claimed scan became a real, seeded project (counted in the redeem route). */
export const METRIC_SKEN_CLAIM = "sken-claim";

export const pageViewMetric = (route: string): string => `view:${route}`;
export const METRIC_GATE_VIEW = pageViewMetric(GATE_ROUTE);
export const METRIC_SKEN_VIEW = pageViewMetric(SKEN_ROUTE);

export type FunnelStatus = "no-data" | "insufficient" | "ok";

export interface FunnelRollup {
  windowDays: number;
  /** inclusive lower bound of the window, UTC day */
  sinceDay: string;
  /** summed denominator events (gate views / signups) inside the window */
  denominator: number;
  /** summed numerator events (signups / activations) inside the window */
  numerator: number;
  /** numerator ÷ denominator — null unless status === "ok", so a thin window can
   *  never render as a confident percentage. */
  rate: number | null;
  status: FunnelStatus;
  /** how many denominator events the window still needs before a rate is shown */
  minDenominator: number;
}

/** Below this many denominator events the rate is withheld: one gate view and one
 *  signup is not "100 % conversion", it is noise. Counts are still reported. */
export const MIN_DENOMINATOR_FOR_RATE = 5;

export const DEFAULT_FUNNEL_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Sum one metric's counters over a [sinceDay..todayDay] window. */
function sumMetric(rows: readonly DailyMetricRow[], metric: string, sinceDay: string, untilDay: string): number {
  let total = 0;
  for (const r of rows) {
    if (r.metric !== metric) continue;
    if (r.day < sinceDay || r.day > untilDay) continue;
    total += Number.isFinite(r.count) && r.count > 0 ? r.count : 0;
  }
  return total;
}

/** One numerator-over-denominator funnel step, computed from recorded counters
 *  only. Day-granular (the counters are daily aggregates), so the ratio compares
 *  event VOLUMES in the same window — it does not pair individual events. */
export function funnelRollup(
  rows: readonly DailyMetricRow[],
  metrics: { numerator: string; denominator: string },
  opts: { windowDays?: number; now?: Date; minDenominator?: number } = {}
): FunnelRollup {
  const windowDays = opts.windowDays ?? DEFAULT_FUNNEL_WINDOW_DAYS;
  const now = opts.now ?? new Date();
  const minDenominator = opts.minDenominator ?? MIN_DENOMINATOR_FOR_RATE;
  // Inclusive window of `windowDays` calendar days ending today (UTC).
  const sinceDay = dayOf(new Date(now.getTime() - (windowDays - 1) * DAY_MS));
  const untilDay = dayOf(now);

  const denominator = sumMetric(rows, metrics.denominator, sinceDay, untilDay);
  const numerator = sumMetric(rows, metrics.numerator, sinceDay, untilDay);

  const status: FunnelStatus =
    denominator === 0 ? "no-data" : denominator < minDenominator ? "insufficient" : "ok";

  return {
    windowDays,
    sinceDay,
    denominator,
    numerator,
    rate: status === "ok" ? numerator / denominator : null,
    status,
    minDenominator,
  };
}

/** Sign-in gate conversion: new accounts created per anonymous gate render. */
export function signupConversionRollup(
  rows: readonly DailyMetricRow[],
  opts: { windowDays?: number; now?: Date; minDenominator?: number } = {}
): FunnelRollup {
  return funnelRollup(rows, { numerator: METRIC_SIGNUP, denominator: METRIC_GATE_VIEW }, opts);
}

/** The public-scan funnel, as its two honest steps — never collapsed into one
 *  headline number, because they fail for opposite reasons:
 *   - `scan`  = scans ÷ /sken views. A low rate is a PAGE problem (the promise, the
 *     form, the trust copy) — the visitor never asked for anything.
 *   - `claim` = claimed projects ÷ scans. A low rate is a RESULT problem (the scan
 *     read wrong, or signing in to keep it felt like too much) — the visitor asked,
 *     got an answer, and walked.
 *  Both inherit `funnelRollup`'s refusal to invent a rate on a thin window, so a
 *  freshly-shipped page reports counts and an explicit "insufficient", not 0 %. */
export function skenFunnelRollup(
  rows: readonly DailyMetricRow[],
  opts: { windowDays?: number; now?: Date; minDenominator?: number } = {}
): { scan: FunnelRollup; claim: FunnelRollup } {
  return {
    scan: funnelRollup(rows, { numerator: METRIC_SKEN_SCAN, denominator: METRIC_SKEN_VIEW }, opts),
    claim: funnelRollup(rows, { numerator: METRIC_SKEN_CLAIM, denominator: METRIC_SKEN_SCAN }, opts),
  };
}

/** Onboarding activation: checklist-complete transitions per new account. */
export function activationRollup(
  rows: readonly DailyMetricRow[],
  opts: { windowDays?: number; now?: Date; minDenominator?: number } = {}
): FunnelRollup {
  return funnelRollup(rows, { numerator: METRIC_ACTIVATION, denominator: METRIC_SIGNUP }, opts);
}
