/** Diminishing-returns response curves: `revenue = a · spend^b` with `b ∈ (0,1]`.
 *
 *  The budget math elsewhere in the app assumes a channel's ROAS is CONSTANT — double
 *  the spend, double the revenue — which is only true in a narrow band around today's
 *  budget. This module fits the honest shape instead: a log-log ordinary least squares
 *  regression over the daily (spend, revenue) pairs, so the MARGINAL return of the next
 *  koruna is what allocation decisions are made on.
 *
 *  Everything here is pure: numbers in, numbers out, no I/O, no React, deterministic,
 *  and NaN/∞-safe. A fit that does not clear the evidence bar (too few days, too weak a
 *  correlation, degenerate spend) is returned with `fitted: false` and the LINEAR
 *  parameters (b = 1, a = trailing ROAS) — callers must treat an unfitted curve as "no
 *  curve" and keep their existing constant-ROAS behaviour. */

import type { ChannelDailyShare, ChannelShare, DailyPoint } from "../types";
import { safe } from "./ratios";

export interface ResponseCurve {
  /** scale term of `revenue = a · spend^b` (a > 0) */
  a: number;
  /** elasticity of revenue w.r.t. spend. 1 = constant ROAS, < 1 = diminishing returns. */
  b: number;
  /** whether the fit cleared the evidence bar. `false` → the linear fallback
   *  (b = 1, a = trailing ROAS); never reallocate on an unfitted curve. */
  fitted: boolean;
  /** daily observations with spend > 0 and revenue > 0 that entered the regression */
  n: number;
  /** coefficient of determination of the log-log fit (0..1) */
  r2: number;
  /** smallest observed daily spend (0 when nothing was observed) */
  spendMin: number;
  /** largest observed daily spend (0 when nothing was observed) */
  spendMax: number;
  /** `channel` = fitted on that channel's OWN daily spend/revenue (a dataset with a
   *  per-day channel mix). `account-scaled` = the ACCOUNT curve re-based onto the
   *  channel's static spend/revenue share — the shape is the account's, not the
   *  channel's, and the UI must say so. */
  basis: "channel" | "account-scaled";
}

/** Daily points with spend > 0 needed before a fit is trusted (two calendar weeks —
 *  enough to average out the weekday shape the curve does not model). */
export const CURVE_MIN_POINTS = 14;

/** Minimum log-log r² for a fit to be trusted. Below it the spend/revenue cloud has no
 *  usable shape and a curve would be a confident-looking coin flip. */
export const CURVE_MIN_R2 = 0.3;

/** Admissible elasticity range for a curve that is acted on. A measured slope AT OR
 *  ABOVE 1 means constant/increasing returns — the constant-ROAS model the app already
 *  has — so it is rejected outright rather than clamped (see `fitResponseCurve`). Below
 *  0.2 the model claims spend barely matters, which is almost always a broken series
 *  rather than a real account, so that end is clamped up. */
export const CURVE_B_RANGE: readonly [number, number] = [0.2, 1];

/** How far past the observed spend range the curve may be evaluated. A fit is evidence
 *  about the band it was measured in; past 1.5× the largest observed day it is flat, so
 *  the allocator cannot buy revenue in a region no data supports. */
export const CURVE_EXTRAPOLATION = 1.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A curve carrying no shape: the linear (constant-ROAS) fallback. */
function unfitted(
  basis: ResponseCurve["basis"],
  roas: number,
  n: number,
  r2: number,
  spendMin: number,
  spendMax: number
): ResponseCurve {
  return {
    a: Number.isFinite(roas) && roas > 0 ? roas : 0,
    b: 1,
    fitted: false,
    n,
    r2: Number.isFinite(r2) ? r2 : 0,
    spendMin,
    spendMax,
    basis,
  };
}

/**
 * Fit `revenue = a · spend^b` by ordinary least squares on `ln(revenue) = ln(a) + b·ln(spend)`.
 *
 * Points with non-positive or non-finite spend/revenue are dropped (a log is undefined
 * there, and a zero-spend day carries no information about the marginal koruna). The
 * fit is rejected — `fitted: false`, linear parameters — when fewer than
 * `CURVE_MIN_POINTS` usable days remain, when the spend is degenerate (every day the
 * same), when r² < `CURVE_MIN_R2`, when the slope shows no diminishing returns at all
 * (b ≥ 1), or when the solved parameters are not finite.
 *
 * A surviving `b` is clamped up to `CURVE_B_RANGE[0]` and `a` is then re-solved through
 * the centroid of the log-log cloud, so a clamped curve still passes through the middle
 * of the data instead of keeping a scale term fitted to a slope it no longer has.
 */
export function fitResponseCurve(
  points: Array<{ spend: number; revenue: number }>,
  basis: ResponseCurve["basis"] = "channel"
): ResponseCurve {
  const usable = points.filter(
    (p) =>
      Number.isFinite(p.spend) &&
      Number.isFinite(p.revenue) &&
      p.spend > 0 &&
      p.revenue > 0
  );

  let spendMin = 0;
  let spendMax = 0;
  let revenueMin = 0;
  let revenueMax = 0;
  let sumSpend = 0;
  let sumRevenue = 0;
  for (const p of usable) {
    spendMin = spendMin === 0 ? p.spend : Math.min(spendMin, p.spend);
    spendMax = Math.max(spendMax, p.spend);
    revenueMin = revenueMin === 0 ? p.revenue : Math.min(revenueMin, p.revenue);
    revenueMax = Math.max(revenueMax, p.revenue);
    sumSpend += p.spend;
    sumRevenue += p.revenue;
  }
  const trailingRoas = safe(sumRevenue, sumSpend);

  const n = usable.length;
  if (n < CURVE_MIN_POINTS) return unfitted(basis, trailingRoas, n, 0, spendMin, spendMax);
  // Degenerate columns carry no fit, and their sums-of-squares are pure floating-point
  // dust (~1e-30) that would otherwise divide into a confident-looking slope and r².
  // Tested on the RANGES, not on the sums, so the rejection is exact.
  if (spendMax <= spendMin || revenueMax <= revenueMin) {
    return unfitted(basis, trailingRoas, n, 0, spendMin, spendMax);
  }

  // Log-log OLS.
  let sx = 0;
  let sy = 0;
  for (const p of usable) {
    sx += Math.log(p.spend);
    sy += Math.log(p.revenue);
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of usable) {
    const dx = Math.log(p.spend) - mx;
    const dy = Math.log(p.revenue) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // Degenerate spend (every observed day identical) carries no slope information.
  if (!(sxx > 0)) return unfitted(basis, trailingRoas, n, 0, spendMin, spendMax);

  const slope = sxy / sxx;
  // r² of the log-log fit. A perfectly flat revenue column (syy = 0) explains nothing
  // about spend, so it reads 0 rather than the 1 the ratio would otherwise imply.
  const r2 = syy > 0 ? clamp((sxy * sxy) / (sxx * syy), 0, 1) : 0;
  if (!Number.isFinite(slope) || !Number.isFinite(r2) || r2 < CURVE_MIN_R2) {
    return unfitted(basis, trailingRoas, n, r2, spendMin, spendMax);
  }

  // A slope at or above 1 means the data shows CONSTANT (or increasing) returns to
  // spend — precisely what the existing constant-ROAS model already assumes, and nothing
  // a curve can improve on. Acting on it anyway would swap each row's arithmetic ROAS
  // for this fit's geometric one (on the demo dataset: 6.56× → 5.92×, a 10 % move) and
  // then label the swap "curve" in the UI. It stays unfitted, so callers keep their
  // existing behaviour and the disclosure honestly reads "linear".
  if (slope >= CURVE_B_RANGE[1]) return unfitted(basis, trailingRoas, n, r2, spendMin, spendMax);

  const b = clamp(slope, CURVE_B_RANGE[0], CURVE_B_RANGE[1]);
  // Re-solve the scale through the centroid so a clamped slope keeps the curve on the data.
  const a = Math.exp(my - b * mx);
  if (!Number.isFinite(a) || a <= 0) {
    return unfitted(basis, trailingRoas, n, r2, spendMin, spendMax);
  }

  return { a, b, fitted: true, n, r2, spendMin, spendMax, basis };
}

/** The spend the curve's SLOPE may be read at: inside the observed band only. Below
 *  `spendMin` and above `1.5 × spendMax` the derivative is held at the nearest edge —
 *  a fit is evidence about where it was measured, and extrapolating a power law to
 *  zero spend produces an infinite marginal return. */
function slopeSpend(c: ResponseCurve, spend: number): number {
  const lo = c.spendMin > 0 ? c.spendMin : 1;
  const hi = c.spendMax > 0 ? c.spendMax * CURVE_EXTRAPOLATION : Number.POSITIVE_INFINITY;
  const s = Number.isFinite(spend) ? spend : 0;
  return clamp(s, Math.min(lo, hi), hi);
}

/** Revenue the curve predicts at `spend`. Zero spend is zero revenue (a fact, not an
 *  extrapolation); above `1.5 × spendMax` the prediction is held flat, so the allocator
 *  cannot buy revenue in a band no data supports. Monotone non-decreasing in `spend`. */
export function revenueAt(c: ResponseCurve, spend: number): number {
  if (!Number.isFinite(spend) || spend <= 0) return 0;
  const hi = c.spendMax > 0 ? c.spendMax * CURVE_EXTRAPOLATION : Number.POSITIVE_INFINITY;
  const s = Math.min(spend, hi);
  const out = c.a * Math.pow(s, c.b);
  return Number.isFinite(out) && out > 0 ? out : 0;
}

/** Marginal ROAS — the revenue the NEXT koruna buys: `d/ds (a·s^b) = a·b·s^(b−1)`,
 *  read inside the observed spend band (see `slopeSpend`). For b = 1 this is the
 *  constant `a`, i.e. exactly the linear model. */
export function marginalRoas(c: ResponseCurve, spend: number): number {
  const s = slopeSpend(c, spend);
  if (!(s > 0)) return 0;
  const out = c.a * c.b * Math.pow(s, c.b - 1);
  return Number.isFinite(out) && out > 0 ? out : 0;
}

/** Marginal profit per koruna of spend: `marginalRoas × margin − 1`. Positive means the
 *  next koruna earns more gross profit than it costs — the whole allocation criterion. */
export function marginalPoas(c: ResponseCurve, spend: number, marginPct: number): number {
  const m = Number.isFinite(marginPct) ? marginPct : 0;
  const out = marginalRoas(c, spend) * m - 1;
  return Number.isFinite(out) ? out : -1;
}

/**
 * A response curve per channel, keyed by channel name.
 *
 * With `channelDaily` (a dataset carrying the per-day channel mix) each channel is fitted
 * on ITS OWN daily spend/revenue — `basis: "channel"`, the honest per-channel shape.
 *
 * Without it, only the ACCOUNT series is reachable, so one account curve is fitted and
 * re-based onto each channel's static share: a channel spending share `sc` of an account
 * total `S` has `s = sc·S`, and taking share `sr` of the revenue gives
 * `revenue(s) = sr · a · (s/sc)^b = (sr·a / sc^b) · s^b`. The elasticity is the account's,
 * not the channel's — `basis: "account-scaled"`, and the UI must qualify it as such.
 *
 * A channel with no spend share (organic/direct) gets an unfitted curve: there is no
 * marginal koruna to price.
 */
export function channelCurves(
  daily: DailyPoint[],
  channels: ChannelShare[],
  channelDaily?: ChannelDailyShare[]
): Record<string, ResponseCurve> {
  const out: Record<string, ResponseCurve> = {};

  if (channelDaily && channelDaily.length > 0) {
    const mixByDate = new Map(channelDaily.map((d) => [d.date, d.shares]));
    channels.forEach((ch, i) => {
      const points = daily.map((p) => {
        const shares = mixByDate.get(p.date)?.[i];
        return {
          spend: shares ? p.cost * shares.cost : 0,
          revenue: shares ? p.revenue * shares.revenue : 0,
        };
      });
      out[ch.channel] = fitResponseCurve(points, "channel");
    });
    return out;
  }

  const account = fitResponseCurve(
    daily.map((p) => ({ spend: p.cost, revenue: p.revenue })),
    "account-scaled"
  );
  for (const ch of channels) {
    const sc = ch.shares.cost;
    const sr = ch.shares.revenue;
    if (!(sc > 0) || !(sr > 0)) {
      out[ch.channel] = unfitted("account-scaled", 0, account.n, account.r2, 0, 0);
      continue;
    }
    const a = (account.a * sr) / Math.pow(sc, account.b);
    out[ch.channel] = {
      ...account,
      a: Number.isFinite(a) && a > 0 ? a : 0,
      fitted: account.fitted && Number.isFinite(a) && a > 0,
      spendMin: account.spendMin * sc,
      spendMax: account.spendMax * sc,
      basis: "account-scaled",
    };
  }
  return out;
}

/** Re-base a curve onto a rescaled spend/revenue world — the "real numbers" override,
 *  where the user replaces the dataset's totals with their own books and every row is
 *  multiplied through. A curve fitted on the dataset's scale would otherwise price the
 *  next koruna in the wrong currency of magnitude.
 *
 *  `revenue'(s') = revenueScale · a · (s'/spendScale)^b`, i.e. `a' = a · revenueScale /
 *  spendScale^b` with the elasticity (and therefore the shape) untouched. A
 *  non-positive or non-finite scale is a no-op, and an unfitted curve stays unfitted. */
export function scaleCurve(c: ResponseCurve, spendScale: number, revenueScale: number): ResponseCurve {
  if (
    !Number.isFinite(spendScale) ||
    !Number.isFinite(revenueScale) ||
    spendScale <= 0 ||
    revenueScale <= 0 ||
    (spendScale === 1 && revenueScale === 1)
  ) {
    return c;
  }
  const a = (c.a * revenueScale) / Math.pow(spendScale, c.b);
  return {
    ...c,
    a: Number.isFinite(a) && a > 0 ? a : 0,
    fitted: c.fitted && Number.isFinite(a) && a > 0,
    spendMin: c.spendMin * spendScale,
    spendMax: c.spendMax * spendScale,
  };
}
