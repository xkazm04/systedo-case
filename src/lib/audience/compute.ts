/** Audience funnel + revenue rollups. Pure. */
import type { AudienceFunnel, RevenueStream, Segment, SubscriberSource } from "./sample";

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
