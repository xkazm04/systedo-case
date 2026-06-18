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
