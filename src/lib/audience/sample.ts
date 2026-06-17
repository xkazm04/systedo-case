/** Illustrative audience funnel, segments and revenue for a content/media project.
 *  Real-integration seam: ESP (newsletter), analytics, ad/sponsorship data. */

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
