/** Shape of the JSON dataset that backs the dashboard (src/data/performance.json). */

export interface DailyPoint {
  /** ISO date, YYYY-MM-DD */
  date: string;
  visits: number;
  cost: number;
  conversions: number;
  revenue: number;
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
  daily: DailyPoint[];
}

/** Raw, additive metrics. */
export type RawMetric = "visits" | "cost" | "conversions" | "revenue";

/** Every metric we surface, including derived ratios. */
export type MetricKey = RawMetric | "pno" | "aov" | "cr" | "roas";
