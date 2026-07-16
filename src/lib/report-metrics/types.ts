/** A1 — live report metrics. The shape the monthly report + AI recap run on when a
 *  project has synced data from an ad platform, so the numbers are the client's own
 *  rather than the scaled case-study series. Framework-free; the daily row is exactly
 *  the PerformanceData.daily shape so the resolver can drop it straight in. */

/** One day of account-level totals. Mirrors PerformanceData.daily. */
export interface MetricRow {
  /** YYYY-MM-DD */
  date: string;
  /** sessions/clicks proxy (Ads clicks map here). STAYS the clicks-stand-in for
   *  backward compat with stored blobs + the sample-series funnel; the first-class
   *  `clicks` field below is the honest paid-click count (equal to it for Ads). */
  visits: number;
  /** ad spend, in the account currency's major unit (e.g. CZK, not micros) */
  cost: number;
  conversions: number;
  /** conversion value / revenue, major unit */
  revenue: number;
  /** paid ad clicks — OPTIONAL so legacy blobs (synced before A1 selected the
   *  paid-traffic pair) read cleanly; present, it feeds canonical DailyPoint.clicks
   *  so live CTR/CPC compute. Equal to `visits` on the Ads path (both are clicks). */
  clicks?: number;
  /** paid ad impressions — OPTIONAL for the same backward-compat reason; with
   *  `clicks` it unlocks live click-through rate on the monthly report. */
  impressions?: number;
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
  /** the account's IANA time zone (Google `customer.time_zone`), captured at ingestion.
   *  Additive + optional: blobs synced before it existed omit it → the next sync's
   *  window falls back to UTC, byte-identical to before. Google Ads `segments.date` is
   *  account-local, so persisting the zone lets the FOLLOWING sync align its window's
   *  edge days to the account's calendar rather than UTC. */
  timeZone?: string;
}

/** The persisted blob per project: provenance + the daily series. */
export interface ReportMetrics {
  meta: MetricsSyncMeta;
  rows: MetricRow[];
}

/** The single, honest definition of "live data": a project is live once it has
 *  actually SYNCED rows — not the moment an Ads account is linked (linking and
 *  syncing are separate, non-atomic actions). Both the report resolver and the
 *  lighter `hasSyncedMetrics` accessor derive "live" from this one rule so the
 *  Monthly Report, the AI recap and the Settings/Overview labels never disagree.
 *  Framework-free; the type predicate lets the resolver narrow after the check. */
export function isLiveMetrics(metrics: ReportMetrics | null): metrics is ReportMetrics {
  return !!metrics && metrics.rows.length > 0;
}
