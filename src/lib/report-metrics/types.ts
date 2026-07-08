/** A1 — live report metrics. The shape the monthly report + AI recap run on when a
 *  project has synced data from an ad platform, so the numbers are the client's own
 *  rather than the scaled case-study series. Framework-free; the daily row is exactly
 *  the PerformanceData.daily shape so the resolver can drop it straight in. */

/** One day of account-level totals. Mirrors PerformanceData.daily. */
export interface MetricRow {
  /** YYYY-MM-DD */
  date: string;
  /** sessions/clicks proxy (Ads clicks map here) */
  visits: number;
  /** ad spend, in the account currency's major unit (e.g. CZK, not micros) */
  cost: number;
  conversions: number;
  /** conversion value / revenue, major unit */
  revenue: number;
}

export type MetricsSource = "google-ads";

/** Provenance for the synced series — drives the honest "živá data" label. */
export interface MetricsSyncMeta {
  source: MetricsSource;
  /** the ad account the data came from (digits only) */
  customerId: string;
  /** ISO timestamp of the sync that produced these rows */
  syncedAt: string;
  /** trailing window fetched, in days */
  days: number;
  /** number of daily rows stored */
  rowCount: number;
}

/** The persisted blob per project: provenance + the daily series. */
export interface ReportMetrics {
  meta: MetricsSyncMeta;
  rows: MetricRow[];
}
