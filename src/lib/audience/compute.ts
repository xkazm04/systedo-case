/** Audience funnel + revenue rollups. Pure. */
import type {
  AudienceFunnel,
  AudienceGoals,
  RevenueStream,
  Segment,
  SubscriberSource,
} from "./sample";

export interface AudienceSummary {
  /** subscribers / visitors */
  subRate: number;
  /** active / subscribers */
  activeRate: number;
  monthlyRevenue: number;
  /** monthly revenue / active subscriber */
  arpu: number;
}

export function audienceSummary(funnel: AudienceFunnel, revenue: RevenueStream[]): AudienceSummary {
  const monthlyRevenue = revenue.reduce((a, r) => a + r.amount, 0);
  return {
    subRate: funnel.visitors > 0 ? funnel.subscribers / funnel.visitors : 0,
    activeRate: funnel.subscribers > 0 ? funnel.activeSubscribers / funnel.subscribers : 0,
    monthlyRevenue,
    arpu: funnel.activeSubscribers > 0 ? monthlyRevenue / funnel.activeSubscribers : 0,
  };
}

/** Estimated monthly revenue contribution of a segment (subs/1000 × RPM). */
export function segmentRevenue(s: Segment): number {
  return (s.subscribers / 1000) * s.rpm;
}

export interface SourceAttributionRow extends SubscriberSource {
  /** share of total new subscribers (0–1) */
  share: number;
  /** true for the single lowest-retention source */
  lowestRetention: boolean;
}

export interface SourceAttribution {
  rows: SourceAttributionRow[];
  /** total new subscribers across all sources */
  totalNewSubs: number;
  /** blended cost per new subscriber across PAID channels only (CZK); 0 if none */
  blendedCostPerSub: number;
  /** name of the lowest-retention source, or null when there are no sources */
  lowestRetentionSource: string | null;
}

/** Rolls subscriber sources up into shares, a blended (paid-only) cost-per-sub
 *  and a flag on the single lowest-retention channel. Rows are sorted by
 *  new-sub share, descending. Pure. */
export function sourceAttribution(sources: SubscriberSource[]): SourceAttribution {
  const totalNewSubs = sources.reduce((a, s) => a + s.newSubs, 0);

  // Blended paid cost-per-sub: total paid spend ÷ paid new subs (ignore organic).
  let paidSpend = 0;
  let paidSubs = 0;
  for (const s of sources) {
    if (s.costPerSub !== undefined) {
      paidSpend += s.costPerSub * s.newSubs;
      paidSubs += s.newSubs;
    }
  }
  const blendedCostPerSub = paidSubs > 0 ? paidSpend / paidSubs : 0;

  // Lowest-retention source (first one wins on ties for a stable flag).
  let lowest: SubscriberSource | null = null;
  for (const s of sources) {
    if (lowest === null || s.retention30 < lowest.retention30) lowest = s;
  }

  const rows: SourceAttributionRow[] = sources
    .map((s) => ({
      ...s,
      share: totalNewSubs > 0 ? s.newSubs / totalNewSubs : 0,
      lowestRetention: lowest !== null && s.source === lowest.source,
    }))
    .sort((a, b) => b.share - a.share);

  return {
    rows,
    totalNewSubs,
    blendedCostPerSub,
    lowestRetentionSource: lowest ? lowest.source : null,
  };
}

// ── #3 Revenue-mix diversification & concentration risk ──────────────────────

export interface RevenueMixRow extends RevenueStream {
  /** share of total monthly revenue (0–1) */
  share: number;
}

export interface RevenueMix {
  /** revenue streams sorted by share, descending */
  rows: RevenueMixRow[];
  total: number;
  /** the single largest stream, or null when there is no revenue */
  topStream: RevenueMixRow | null;
  /** share of the largest stream (0–1) — concentration risk */
  concentration: number;
  /** Herfindahl–Hirschman index over shares (0–1); 1 = a single stream,
   *  →0 = many evenly-sized streams. */
  hhi: number;
  /** diversification score (0–1) = 1 − HHI; higher is more diversified */
  diversification: number;
  /** true when one stream carries more than DEPENDENCY_THRESHOLD of revenue */
  concentrated: boolean;
}

/** Single stream carrying more than this share trips the dependency warning. */
export const DEPENDENCY_THRESHOLD = 0.6;

/** Rolls revenue streams into per-stream shares, a top-stream concentration and an
 *  HHI-style diversification score. Negative amounts are clamped to 0 so a
 *  correction can't produce shares outside [0,1]. Rows sort by share, desc. Pure. */
export function revenueMix(revenue: RevenueStream[]): RevenueMix {
  const clamped = revenue.map((r) => ({ ...r, amount: Math.max(0, r.amount) }));
  const total = clamped.reduce((a, r) => a + r.amount, 0);

  const rows: RevenueMixRow[] = clamped
    .map((r) => ({ ...r, share: total > 0 ? r.amount / total : 0 }))
    .sort((a, b) => b.share - a.share);

  const hhi = rows.reduce((a, r) => a + r.share * r.share, 0);
  const topStream = rows.length > 0 ? rows[0]! : null;
  const concentration = topStream ? topStream.share : 0;

  return {
    rows,
    total,
    topStream,
    concentration,
    hhi,
    diversification: total > 0 ? 1 - hhi : 0,
    concentrated: concentration > DEPENDENCY_THRESHOLD,
  };
}

// ── #2 Sponsorship rate-card calculator ──────────────────────────────────────

export interface RateCardBand {
  cpmFloor: number;
  cpmCeil: number;
}

export interface SegmentPremiumRow {
  name: string;
  subscribers: number;
  openRate: number;
  /** opens per send for this segment */
  opens: number;
  /** premium vs. the blended open rate (e.g. 0.18 = +18 %); can be negative */
  premium: number;
}

export interface RateCard {
  /** active subscribers reachable per send */
  activeReach: number;
  /** blended open rate across segments, weighted by subscribers (0–1) */
  blendedOpenRate: number;
  /** estimated opens per send (activeReach × blendedOpenRate) */
  opensPerSend: number;
  /** suggested slot price floor / ceiling per send (CZK) */
  priceFloor: number;
  priceCeil: number;
  /** mid-point of the suggested range (CZK) */
  priceMid: number;
  /** effective CZK per 1000 opens at the mid-point */
  pricePer1000Opens: number;
  /** per-segment open premium, sorted by premium desc */
  segments: SegmentPremiumRow[];
}

/** Builds a sponsorship rate card from the funnel + segments. The slot price is
 *  estimated opens-per-send × a benchmark CPM band (price per 1000 opens), so a
 *  sponsor pays for attention delivered, not raw list size. Pure. */
export function rateCard(
  funnel: AudienceFunnel,
  segments: Segment[],
  band: RateCardBand
): RateCard {
  const activeReach = Math.max(0, funnel.activeSubscribers);

  // Subscriber-weighted blended open rate across segments.
  const segSubs = segments.reduce((a, sg) => a + sg.subscribers, 0);
  const blendedOpenRate =
    segSubs > 0 ? segments.reduce((a, sg) => a + sg.openRate * sg.subscribers, 0) / segSubs : 0;

  const opensPerSend = activeReach * blendedOpenRate;
  const per1000 = opensPerSend / 1000;
  const priceFloor = per1000 * band.cpmFloor;
  const priceCeil = per1000 * band.cpmCeil;
  const priceMid = (priceFloor + priceCeil) / 2;

  const segmentRows: SegmentPremiumRow[] = segments
    .map((sg) => ({
      name: sg.name,
      subscribers: sg.subscribers,
      openRate: sg.openRate,
      opens: sg.subscribers * sg.openRate,
      premium: blendedOpenRate > 0 ? sg.openRate / blendedOpenRate - 1 : 0,
    }))
    .sort((a, b) => b.premium - a.premium);

  return {
    activeReach,
    blendedOpenRate,
    opensPerSend,
    priceFloor,
    priceCeil,
    priceMid,
    pricePer1000Opens: opensPerSend > 0 ? (priceMid / opensPerSend) * 1000 : 0,
    segments: segmentRows,
  };
}

// ── #4 RPM & subscriber-growth trend with forecast ───────────────────────────

export interface Trend {
  /** the series, oldest → newest */
  series: number[];
  /** latest value */
  latest: number;
  /** previous value (the point before latest), or null with < 2 points */
  previous: number | null;
  /** month-over-month growth as a fraction (0.04 = +4 %), or null with < 2 points */
  momGrowth: number | null;
  /** 3-month moving average of the tail, or the mean of what's available */
  movingAvg3: number;
  /** linear least-squares slope per step over the series */
  slope: number;
  /** one-step-ahead linear projection from the fitted line */
  forecast: number;
}

/** Trend stats for a short monthly series: MoM growth, a 3-month moving average,
 *  a least-squares slope and a one-step-ahead forecast. Robust to short / empty
 *  series (no NaN leaks). Pure. */
export function trend(series: number[]): Trend {
  const n = series.length;
  if (n === 0) {
    return { series, latest: 0, previous: null, momGrowth: null, movingAvg3: 0, slope: 0, forecast: 0 };
  }

  const latest = series[n - 1]!;
  const previous = n >= 2 ? series[n - 2]! : null;
  const momGrowth = previous != null && previous !== 0 ? latest / previous - 1 : null;

  const tail = series.slice(Math.max(0, n - 3));
  const movingAvg3 = tail.reduce((a, v) => a + v, 0) / tail.length;

  // Least-squares slope over x = 0..n-1.
  let slope = 0;
  if (n >= 2) {
    const xMean = (n - 1) / 2;
    const yMean = series.reduce((a, v) => a + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (series[i]! - yMean);
      den += (i - xMean) * (i - xMean);
    }
    slope = den !== 0 ? num / den : 0;
    // Project from the fitted line at x = n (intercept = yMean − slope·xMean).
    const intercept = yMean - slope * xMean;
    return { series, latest, previous, momGrowth, movingAvg3, slope, forecast: intercept + slope * n };
  }

  return { series, latest, previous, momGrowth, movingAvg3, slope, forecast: latest };
}

// ── #5 Audience-growth goal tracker ──────────────────────────────────────────

export interface GoalLine {
  current: number;
  target: number;
  /** progress toward target (0–1+), clamped at the floor to 0 */
  progress: number;
  /** remaining absolute gap to target (0 when already met) */
  remaining: number;
  /** true when current ≥ target */
  met: boolean;
  /** estimated months to reach target at the current growth, or null when it
   *  can't be reached (no/negative growth) or is already met */
  etaMonths: number | null;
}

export interface GoalProgress {
  subscribers: GoalLine;
  revenue: GoalLine;
}

/** Progress toward subscriber + monthly-revenue targets, with a simple ETA from
 *  the supplied month-over-month growth fraction (applied compounding). Returns
 *  null ETAs when a target is met or unreachable. Pure. */
export function goalProgress(
  funnel: AudienceFunnel,
  summary: AudienceSummary,
  goals: AudienceGoals,
  growthRate: number
): GoalProgress {
  const line = (current: number, target: number): GoalLine => {
    const met = current >= target;
    const remaining = Math.max(0, target - current);
    let etaMonths: number | null = null;
    // Compounding ETA: current·(1+g)^t ≥ target  ⇒  t = ln(target/current)/ln(1+g).
    if (!met && current > 0 && growthRate > 0) {
      const months = Math.log(target / current) / Math.log(1 + growthRate);
      etaMonths = Number.isFinite(months) ? Math.ceil(months) : null;
    }
    return {
      current,
      target,
      progress: target > 0 ? Math.max(0, current / target) : 0,
      remaining,
      met,
      etaMonths,
    };
  };

  return {
    subscribers: line(funnel.subscribers, goals.subscriberTarget),
    revenue: line(summary.monthlyRevenue, goals.monthlyRevenueTarget),
  };
}
