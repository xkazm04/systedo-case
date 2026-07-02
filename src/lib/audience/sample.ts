/** Illustrative audience funnel, segments and revenue for a content/media project.
 *  Real-integration seam: ESP (newsletter), analytics, ad/sponsorship data. */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface AudienceFunnel {
  /** monthly visitors */
  visitors: number;
  subscribers: number;
  activeSubscribers: number;
}

export interface Segment {
  name: string;
  subscribers: number;
  openRate: number;
  /** revenue per 1000 subscribers per month (CZK) */
  rpm: number;
}

export interface RevenueStream {
  source: string;
  amount: number;
}

/** Optional audience-growth targets for the goal tracker. */
export interface AudienceGoals {
  /** target total subscribers */
  subscriberTarget: number;
  /** target monthly revenue (CZK) */
  monthlyRevenueTarget: number;
}

/** One month of a trailing history series (oldest → newest). */
export interface MonthlyPoint {
  /** ISO month, first of the month (e.g. "2026-01-01") */
  month: string;
  value: number;
}

/** Where new subscribers came from over the trailing window. */
export interface SubscriberSource {
  /** acquisition channel label (cs) */
  source: string;
  /** new subscribers attributed to this channel in the window */
  newSubs: number;
  /** paid acquisition cost per new subscriber (CZK); omitted for organic channels */
  costPerSub?: number;
  /** share still active after 30 days (0–1) */
  retention30: number;
}

export const SAMPLE_FUNNEL: AudienceFunnel = {
  visitors: 142_000,
  subscribers: 18_600,
  activeSubscribers: 12_400,
};

export const SAMPLE_SEGMENTS: Segment[] = [
  { name: "Plánují miminko", subscribers: 4100, openRate: 0.61, rpm: 420 },
  { name: "Novopečení rodiče", subscribers: 7200, openRate: 0.52, rpm: 380 },
  { name: "Batolata", subscribers: 5300, openRate: 0.44, rpm: 300 },
  { name: "Neaktivní", subscribers: 2000, openRate: 0.08, rpm: 90 },
];

export const SAMPLE_REVENUE: RevenueStream[] = [
  { source: "Sponzoring newsletteru", amount: 84_000 },
  { source: "Affiliate", amount: 63_000 },
  { source: "Display reklama", amount: 41_000 },
];

/** New subscribers by acquisition channel over the trailing window.
 *  `newSubs` sum (2 480) is the period's new-subscriber inflow into the funnel. */
export const SAMPLE_SUBSCRIBER_SOURCES: SubscriberSource[] = [
  { source: "Organické vyhledávání", newSubs: 980, retention30: 0.74 },
  { source: "Newsletter referral", newSubs: 610, retention30: 0.81 },
  { source: "Sociální sítě", newSubs: 520, costPerSub: 38, retention30: 0.52 },
  { source: "Placená reklama", newSubs: 240, costPerSub: 95, retention30: 0.41 },
  { source: "Partnerské weby", newSubs: 130, costPerSub: 22, retention30: 0.63 },
];

/** Trailing-12-month total-subscriber history (oldest → newest), ending at the
 *  current `SAMPLE_FUNNEL.subscribers` (18 600). Seam: ESP list-size snapshots. */
export const SAMPLE_SUBSCRIBER_HISTORY: MonthlyPoint[] = [
  { month: "2025-07-01", value: 14_100 },
  { month: "2025-08-01", value: 14_650 },
  { month: "2025-09-01", value: 15_280 },
  { month: "2025-10-01", value: 15_820 },
  { month: "2025-11-01", value: 16_310 },
  { month: "2025-12-01", value: 16_740 },
  { month: "2026-01-01", value: 17_120 },
  { month: "2026-02-01", value: 17_460 },
  { month: "2026-03-01", value: 17_810 },
  { month: "2026-04-01", value: 18_090 },
  { month: "2026-05-01", value: 18_360 },
  { month: "2026-06-01", value: 18_600 },
];

/** Trailing-12-month blended RPM history (CZK revenue per 1000 active subs),
 *  oldest → newest. Seam: ad/sponsorship revenue ÷ active list size per month. */
export const SAMPLE_RPM_HISTORY: MonthlyPoint[] = [
  { month: "2025-07-01", value: 12.9 },
  { month: "2025-08-01", value: 13.4 },
  { month: "2025-09-01", value: 13.2 },
  { month: "2025-10-01", value: 13.8 },
  { month: "2025-11-01", value: 14.6 },
  { month: "2025-12-01", value: 15.1 },
  { month: "2026-01-01", value: 14.7 },
  { month: "2026-02-01", value: 15.3 },
  { month: "2026-03-01", value: 15.9 },
  { month: "2026-04-01", value: 16.2 },
  { month: "2026-05-01", value: 16.8 },
  { month: "2026-06-01", value: 17.3 },
];

/** Illustrative audience-growth goals for the goal tracker. */
export const SAMPLE_GOALS: AudienceGoals = {
  subscriberTarget: 25_000,
  monthlyRevenueTarget: 260_000,
};

/** The whole audience dataset for one project. */
export interface AudienceData {
  funnel: AudienceFunnel;
  segments: Segment[];
  revenue: RevenueStream[];
  subscriberSources: SubscriberSource[];
  subscriberHistory: MonthlyPoint[];
  rpmHistory: MonthlyPoint[];
  goals: AudienceGoals;
}

/** Per-project audience data: magnitude fields (visitors, subscribers, revenue,
 *  new subs, targets, history levels) scale by one uniform per-project factor;
 *  bounded rates (openRate, RPM, retention30, costPerSub) pass through so they
 *  stay valid. The funnel's subscriber total is recomputed from the scaled
 *  segments, so the "segments sum to the total" invariant stays exact. */
export function audienceForProject(project: Project): AudienceData {
  const v = projectVary(project, "audience");
  const segments = SAMPLE_SEGMENTS.map((s) => ({ ...s, subscribers: v.int(s.subscribers) }));
  const subscribers = segments.reduce((sum, s) => sum + s.subscribers, 0);
  return {
    funnel: {
      visitors: v.int(SAMPLE_FUNNEL.visitors),
      subscribers,
      activeSubscribers: v.int(SAMPLE_FUNNEL.activeSubscribers),
    },
    segments,
    revenue: SAMPLE_REVENUE.map((r) => ({ ...r, amount: v.int(r.amount) })),
    subscriberSources: SAMPLE_SUBSCRIBER_SOURCES.map((s) => ({ ...s, newSubs: v.int(s.newSubs) })),
    subscriberHistory: SAMPLE_SUBSCRIBER_HISTORY.map((p) => ({ ...p, value: v.int(p.value) })),
    rpmHistory: SAMPLE_RPM_HISTORY,
    goals: {
      subscriberTarget: v.int(SAMPLE_GOALS.subscriberTarget),
      monthlyRevenueTarget: v.int(SAMPLE_GOALS.monthlyRevenueTarget),
    },
  };
}
