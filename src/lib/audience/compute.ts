/** Audience funnel + revenue rollups. Pure. */
import type { AudienceFunnel, RevenueStream, Segment } from "./sample";

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
