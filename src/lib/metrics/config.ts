/** One place for the engine's statistical constants and its single variance
 *  estimator, so the four detectors (anomalies, trends, series significance and
 *  the pacing sigma) stop each rolling their own trailing window and their own
 *  variance formula. Pure math + named constants; no data, no I/O.
 *
 *  ## One variance estimator
 *  Every module now standardises deviations with the SAMPLE variance (Bessel's
 *  correction, ÷(n−1)). Daily points are a *sample* of an account's behaviour,
 *  not its whole population, so the unbiased estimator is the correct one — it is
 *  what `series.significanceFor` and `trends` already used. `anomalies` and the
 *  pacing sigma historically used the population form (÷n); they now share this
 *  helper. For anomalies that would shift every z by the constant factor
 *  √((n−1)/n), so `detectAnomalies` recalibrates its |z| threshold by the same
 *  factor (see `anomalyThreshold`) — the exact same days stay flagged, only the
 *  reported z rescales by <2 % (n≥28). See `test-unit/metrics-anomalies.test.mjs`.
 */

/** Coverage tier for a daily series: how much the detectors can honestly say. */
export type Coverage = "full" | "degraded" | "insufficient";

/** Trailing windows the engine reads, in days. Multiples of 7 keep every window
 *  weekday-balanced (each weekday appears the same number of times). */
export const WINDOWS = {
  /** anomaly de-seasonalised baseline (also the ROAS window for implied spend) */
  anomalyBaseline: 28,
  /** shorter anomaly baseline used under degraded coverage — still a whole
   *  number of weeks, so the de-seasonalised baseline stays weekday-balanced */
  anomalyBaselineDegraded: 14,
  /** smallest weekday-balanced baseline we will run an anomaly pass on */
  anomalyBaselineMin: 7,
  /** de-seasonalised daily-revenue sigma window for the pacing confidence band */
  sigma: 56,
  /** weekday-seasonality profile window (up to 12 whole weeks) */
  weekday: 84,
  /** trailing ROAS window that prices a pacing shortfall into extra daily spend */
  roas: 28,
} as const;

/** Coverage boundaries, in days of daily data. `full` needs one more day than the
 *  anomaly baseline (a baseline plus at least one day to score against it). */
export const COVERAGE = {
  /** ≥ this many days → full-confidence anomaly detection (baseline + a score day) */
  fullMinDays: WINDOWS.anomalyBaseline + 1,
  /** ≥ this many days (but < full) → degraded: shorter baseline, wider z threshold */
  degradedMinDays: 10,
} as const;

/** |z| threshold to flag an anomalous day at full coverage (population-variance
 *  era value; `anomalyThreshold` converts it for the sample estimator). */
export const ANOMALY_Z = 2.5;
/** Wider |z| bar under degraded coverage — a shorter baseline gives a noisier
 *  std estimate, so we demand a stronger signal to avoid false positives. */
export const ANOMALY_Z_DEGRADED = 3.0;

/** Classify a series length into a coverage tier. */
export function seriesCoverage(length: number): Coverage {
  if (length >= COVERAGE.fullMinDays) return "full";
  if (length >= COVERAGE.degradedMinDays) return "degraded";
  return "insufficient";
}

/** The anomaly-baseline window to use for a series of `length` days at `coverage`.
 *  Full → the standard 28-day baseline; degraded → 14 days when the series can
 *  spare a couple of score days, else the 7-day floor. */
export function anomalyWindow(length: number, coverage: Coverage): number {
  if (coverage === "full") return WINDOWS.anomalyBaseline;
  return length - 3 >= WINDOWS.anomalyBaselineDegraded
    ? WINDOWS.anomalyBaselineDegraded
    : WINDOWS.anomalyBaselineMin;
}

/**
 * The |z| threshold to compare a sample-variance z against, given the base
 * `threshold` (expressed in population-variance z units) and the baseline size
 * `n`. A sample-variance z equals the population-variance z times √((n−1)/n), so
 * scaling the threshold by the same factor keeps the flag decision identical to
 * the population-variance era while the code uses one estimator everywhere.
 */
export function anomalyThreshold(threshold: number, n: number): number {
  return n > 1 ? threshold * Math.sqrt((n - 1) / n) : threshold;
}

/** Arithmetic mean (0 for an empty list). */
export function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Unbiased sample variance (÷(n−1), Bessel's correction). A single point has no
 *  spread, so variance is 0. The engine's ONE variance estimator. */
export function sampleVariance(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
}

/** Sample standard deviation — √{@link sampleVariance}. */
export function sampleStd(xs: number[]): number {
  return Math.sqrt(sampleVariance(xs));
}
