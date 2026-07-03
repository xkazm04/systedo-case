/** Shape of the JSON dataset that backs the dashboard (src/data/performance.json). */

export interface DailyPoint {
  /** ISO date, YYYY-MM-DD */
  date: string;
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
  /** paid ad impressions (optional — older datasets lack the paid-traffic pair;
   *  derived CTR/CPC gracefully fall back to 0 when absent) */
  impressions?: number;
  /** paid ad clicks (optional, see impressions) */
  clicks?: number;
}

export interface ChannelShare {
  channel: string;
  color: string;
  /** Fraction of the total each channel represents on each dimension (each dim sums to 1). */
  shares: {
    visits: number;
    cost: number;
    conversions: number;
    revenue: number;
  };
}

/** Kind of an authored story event baked into the demo series by the generator. */
export type PerformanceEventKind = "spike" | "outage" | "cost-runaway" | "milestone";

/** One entry of the dataset's story-event calendar. The generator has already
 *  applied the event's effect to the affected `daily` points; this record is the
 *  annotation layer (chart markers, AI grounding, "what happened here"). */
export interface PerformanceEvent {
  /** ISO date the event starts, YYYY-MM-DD */
  date: string;
  /** short Czech label, e.g. "Black Friday — špička poptávky" */
  label: string;
  kind: PerformanceEventKind;
  /** consecutive days the event spans (absent = 1) */
  days?: number;
}

export interface PerformanceData {
  client: {
    name: string;
    domain: string;
    segment: string;
    currency: string;
    managedBy: string;
  };
  meta: {
    disclaimer: string;
    asOf: string;
    days: number;
    seed: number;
  };
  goals: {
    pno: number;
    monthlyRevenue: number;
  };
  channels: ChannelShare[];
  /** authored story-event calendar (optional — older datasets lack it) */
  events?: PerformanceEvent[];
  daily: DailyPoint[];
}

/** Raw, additive metrics (always present on every DailyPoint). The optional
 *  paid-traffic pair (impressions/clicks) deliberately stays out: seasonality
 *  weighting and anomaly detection iterate this union and must not divide by
 *  fields an older dataset lacks. */
export type RawMetric = "visits" | "cost" | "conversions" | "revenue";

/** Every metric we surface, including derived ratios. `ctr` (clicks /
 *  impressions) and `cpc` (cost / clicks) derive from the optional paid-traffic
 *  fields and read 0 when a dataset doesn't carry them. */
export type MetricKey = RawMetric | "pno" | "aov" | "cr" | "roas" | "ctr" | "cpc";
