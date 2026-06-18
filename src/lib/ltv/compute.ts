/** CAC / LTV / payback math over acquisition cohorts. Extrapolates the retention
 *  tail geometrically to a fixed horizon, then derives lifetime value, the
 *  LTV:CAC ratio and the payback month. Pure. */
import type { Cohort, CohortChannel } from "./sample";
import { isPaidChannel } from "./sample";

export const LTV_HORIZON = 12;

/** Per-channel acquisition economics within a cohort. CAC is that channel's own
 *  spend per signup; payback / LTV:CAC reuse the cohort-level LTV-per-user. */
export interface ChannelMetrics extends CohortChannel {
  /** spend / signups for this channel (CZK), 0 when the channel is free or empty */
  cac: number;
  /** whether the channel costs ad money (excluded from paid CAC when false) */
  paid: boolean;
  /** cohort LTV per user / channel CAC */
  ltvCac: number;
  /** 1-based month this channel's CAC is recovered, or null within horizon */
  paybackMonth: number | null;
}

export interface CohortMetrics extends Cohort {
  cac: number;
  /** retained months M3 (for the table) */
  m3: number;
  ltv: number;
  ltvCac: number;
  /** 1-based month the cumulative revenue/user covers CAC, or null within horizon */
  paybackMonth: number | null;
  /** paid-only CAC (excludes free/organic channels); equals `cac` when no breakdown */
  paidCac: number;
  /** per-channel economics when the cohort has a breakdown, else empty */
  channelMetrics: ChannelMetrics[];
  /** retention survival curve M0…M(horizon-1): observed months followed by the
   *  geometrically extrapolated tail (so the UI can draw the decay shape) */
  survival: number[];
  /** count of leading `survival` entries backed by observed retention data; the
   *  remainder is modeled (extrapolated) and should read as visually distinct */
  observedMonths: number;
}

export interface LtvSummary {
  signups: number;
  blendedCac: number;
  /** blended CAC over paid signups only (excludes free/organic) */
  paidCac: number;
  /** signups won through paid channels (excludes free/organic) */
  paidSignups: number;
  avgLtvCac: number;
  avgPayback: number | null;
}

/** Retention curve extended to `horizon` months by continuing the last observed
 *  month-over-month survival ratio (clamped to a sane band). */
function survivalCurve(retention: number[], horizon: number): number[] {
  const out = retention.slice(0, horizon);
  const n = retention.length;
  const ratio = n >= 2 ? Math.min(0.98, Math.max(0.8, retention[n - 1]! / retention[n - 2]!)) : 0.9;
  let last = retention[n - 1]!;
  for (let m = n; m < horizon; m++) {
    last *= ratio;
    out.push(last);
  }
  return out;
}

/** First 1-based month where cumulative revenue/user (from the survival curve)
 *  covers `cac`, or null if not recovered within the horizon. A free channel
 *  (cac === 0) pays back in month 1. */
function paybackOf(survival: number[], arpu: number, cac: number): number | null {
  let cum = 0;
  for (let m = 0; m < survival.length; m++) {
    cum += survival[m]! * arpu;
    if (cum >= cac) return m + 1;
  }
  return null;
}

export function withMetrics(c: Cohort): CohortMetrics {
  const cac = c.signups > 0 ? c.spend / c.signups : 0;
  const survival = survivalCurve(c.retention, LTV_HORIZON);
  const ltv = survival.reduce((a, s) => a + s * c.arpu, 0);
  const paybackMonth = paybackOf(survival, c.arpu, cac);

  // Per-channel economics: each channel's own spend/signups CAC, but the cohort's
  // shared LTV-per-user for payback and LTV:CAC.
  const channelMetrics: ChannelMetrics[] = (c.channels ?? []).map((ch) => {
    const chCac = ch.signups > 0 ? ch.spend / ch.signups : 0;
    const paid = isPaidChannel(ch.channel);
    return {
      ...ch,
      cac: chCac,
      paid,
      ltvCac: chCac > 0 ? ltv / chCac : 0,
      paybackMonth: paybackOf(survival, c.arpu, chCac),
    };
  });

  // Paid-only CAC: spend over paid signups, excluding free/organic channels.
  // With no breakdown, paid CAC degrades to the blended CAC (no regression).
  let paidCac = cac;
  if (channelMetrics.length > 0) {
    const paidSpend = channelMetrics.filter((m) => m.paid).reduce((a, m) => a + m.spend, 0);
    const paidSignups = channelMetrics.filter((m) => m.paid).reduce((a, m) => a + m.signups, 0);
    paidCac = paidSignups > 0 ? paidSpend / paidSignups : 0;
  }

  return {
    ...c,
    cac,
    m3: c.retention[3] ?? c.retention[c.retention.length - 1] ?? 0,
    ltv,
    ltvCac: cac > 0 ? ltv / cac : 0,
    paybackMonth,
    paidCac,
    channelMetrics,
    survival,
    observedMonths: Math.min(c.retention.length, LTV_HORIZON),
  };
}

/** A survival curve laid out as an SVG sparkline: each point is mapped into a
 *  [0,width] × [0,height] box (y inverted so 100 % retention sits at the top).
 *  The curve is split at `observedMonths` into the data-backed `observed`
 *  segment and the modeled `extrapolated` tail, which share one boundary point
 *  so the polylines join seamlessly. Pure — no DOM. */
export interface SparklinePoint {
  x: number;
  y: number;
}
export interface SurvivalSparkline {
  observed: SparklinePoint[];
  extrapolated: SparklinePoint[];
}

/** Build sparkline geometry from a survival curve. Retention is a fraction in
 *  [0,1]; the y-axis is fixed to that range (not auto-scaled) so curves are
 *  comparable across cohorts. A single-point curve yields one observed point and
 *  no extrapolated segment. `width`/`height` are the SVG view box in px. */
export function survivalSparkline(
  survival: number[],
  observedMonths: number,
  width: number,
  height: number
): SurvivalSparkline {
  const n = survival.length;
  if (n === 0) return { observed: [], extrapolated: [] };
  const obs = Math.max(0, Math.min(observedMonths, n));
  const step = n > 1 ? width / (n - 1) : 0;
  const points: SparklinePoint[] = survival.map((s, i) => ({
    x: i * step,
    // clamp the fraction to [0,1] then invert: 1 → y=0 (top), 0 → y=height
    y: height * (1 - Math.min(1, Math.max(0, s))),
  }));
  // The extrapolated polyline reuses the last observed point as its first vertex
  // so the two segments connect without a visual gap.
  const splitAt = Math.max(0, obs - 1);
  return {
    observed: points.slice(0, obs),
    extrapolated: obs < n ? points.slice(splitAt) : [],
  };
}

/** Serialize sparkline points into an SVG `points` attribute ("x,y x,y …").
 *  Coordinates are rounded to 2 decimals to keep the markup compact. */
export function sparklinePoints(points: SparklinePoint[]): string {
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Direction of the cohort trend, derived from whether LTV:CAC is rising from the
 *  oldest to the newest cohort. `flat` covers the single-cohort / no-change case. */
export type TrendDirection = "improving" | "worsening" | "flat";

/** Newest-vs-oldest cohort movement: absolute deltas for CAC and LTV, the relative
 *  change in LTV:CAC, and an overall direction. `rows` is taken in chronological
 *  order (oldest first); the trend compares the last row against the first. Pure. */
export interface CohortTrend {
  /** the oldest (first) and newest (last) cohort month labels */
  fromMonth: string;
  toMonth: string;
  /** newest − oldest CAC (CZK); positive means CAC went up */
  cacDelta: number;
  /** newest − oldest LTV (CZK); positive means LTV went up */
  ltvDelta: number;
  /** newest − oldest LTV:CAC ratio (absolute, e.g. +0.4×) */
  ltvCacDelta: number;
  /** relative change of LTV:CAC as a fraction (+0.12 = +12 %), null if oldest is 0 */
  ltvCacDeltaPct: number | null;
  /** rising LTV:CAC → improving, falling → worsening, unchanged/single → flat */
  direction: TrendDirection;
}

/** Compare the newest cohort against the oldest. Returns null when there are
 *  fewer than two cohorts (no trend to draw). */
export function cohortTrend(rows: CohortMetrics[]): CohortTrend | null {
  if (rows.length < 2) return null;
  const oldest = rows[0]!;
  const newest = rows[rows.length - 1]!;
  const ltvCacDelta = newest.ltvCac - oldest.ltvCac;
  const direction: TrendDirection =
    ltvCacDelta > 0 ? "improving" : ltvCacDelta < 0 ? "worsening" : "flat";
  return {
    fromMonth: oldest.month,
    toMonth: newest.month,
    cacDelta: newest.cac - oldest.cac,
    ltvDelta: newest.ltv - oldest.ltv,
    ltvCacDelta,
    ltvCacDeltaPct: oldest.ltvCac > 0 ? ltvCacDelta / oldest.ltvCac : null,
    direction,
  };
}

/** A single field escaped for RFC-4180 CSV: wrap in double quotes and double any
 *  embedded quote whenever the value contains a quote, comma, or newline. */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV of the cohort table (header + one row per cohort) with the raw
 *  numeric values, so a deck/sheet can reformat them. CRLF line endings per
 *  RFC-4180; every cell escaped. Pure — no DOM, safe to unit-test. */
export function buildCohortCsv(rows: CohortMetrics[]): string {
  const header = ["Kohorta", "Registrace", "CAC", "M3 retence", "LTV", "LTV:CAC", "Návratnost (měs.)"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.month),
        csvCell(r.signups),
        csvCell(Math.round(r.cac)),
        csvCell(r.m3),
        csvCell(Math.round(r.ltv)),
        csvCell(Number(r.ltvCac.toFixed(2))),
        csvCell(r.paybackMonth ?? ""),
      ].join(",")
    );
  }
  return lines.join("\r\n");
}

export function ltvSummary(cohorts: Cohort[]): LtvSummary {
  const rows = cohorts.map(withMetrics);
  const signups = rows.reduce((a, r) => a + r.signups, 0);
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const paybacks = rows.map((r) => r.paybackMonth).filter((p): p is number => p != null);

  // Blended paid CAC: total paid spend / total paid signups. A cohort without a
  // breakdown contributes its blended spend/signups as fully paid (today's
  // behavior), so the paid figure never regresses below blended for such data.
  let paidSpend = 0;
  let paidSignups = 0;
  for (const r of rows) {
    if (r.channelMetrics.length > 0) {
      for (const m of r.channelMetrics) {
        if (m.paid) {
          paidSpend += m.spend;
          paidSignups += m.signups;
        }
      }
    } else {
      paidSpend += r.spend;
      paidSignups += r.signups;
    }
  }

  return {
    signups,
    blendedCac: signups > 0 ? spend / signups : 0,
    paidCac: paidSignups > 0 ? paidSpend / paidSignups : 0,
    paidSignups,
    avgLtvCac: rows.length ? rows.reduce((a, r) => a + r.ltvCac, 0) / rows.length : 0,
    avgPayback: paybacks.length ? paybacks.reduce((a, p) => a + p, 0) / paybacks.length : null,
  };
}
