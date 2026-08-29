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

/** A platform a project's report series can be synced FROM. ADR-0010: a project
 *  holds one section per source, keyed per-account in the campaign stores; the
 *  platform IS the channel dimension the blended report reads. */
export type MetricsSource = "google-ads" | "sklik";

/** Blend order + the enumerable source set. "google-ads" is first, so it is the
 *  PRIMARY section whenever it exists (see `readSections` / `primarySection`). */
export const METRICS_SOURCES: readonly MetricsSource[] = ["google-ads", "sklik"];

/** Narrow an unvalidated stored `source` string to a known MetricsSource. Stored
 *  blobs are cast, never validated, so a legacy / drifted value must not poison the
 *  total `Record<MetricsSource, …>` lookups the blend runs. Unknown → "google-ads",
 *  which is what every pre-ADR-0010 blob actually is. */
export function coerceMetricsSource(v: unknown): MetricsSource {
  return typeof v === "string" && (METRICS_SOURCES as readonly string[]).includes(v)
    ? (v as MetricsSource)
    : "google-ads";
}

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
  /** the account's ISO-4217 currency (Google `customer.currency_code`), captured at
   *  ingestion beside `timeZone`. Additive + optional: blobs synced before it existed
   *  omit it → the report treats the amounts as the base CZK, byte-identical to before.
   *  The sync stores NATIVE account amounts (no conversion), so this only decides which
   *  currency SYMBOL the money surfaces render — a EUR account's real spend no longer
   *  reads as koruny under the "Živá data" label. */
  currencyCode?: string;
}

/** One platform's slice of a project's report series — provenance + its own daily
 *  rows. Exactly the legacy `{meta, rows}` pair, so a pre-ADR-0010 blob IS one
 *  section (see `readSections` in ./blend). */
export interface ReportMetricsSection {
  meta: MetricsSyncMeta;
  rows: MetricRow[];
}

/** The persisted blob per project: provenance + the daily series.
 *
 *  ADR-0010: the blob now holds ONE SECTION PER SOURCE under `sources` (additive,
 *  optional). The top-level `meta`/`rows` keep their legacy meaning — they are the
 *  PRIMARY section (Google when present, else Sklik), rewritten from it on every
 *  write — so every reader written before sections existed keeps working unchanged,
 *  and a blob written before sections exist reads as the single section its own
 *  `meta.source` names. Nothing migrates: no schema changed (ADR-0001). */
export interface ReportMetrics {
  meta: MetricsSyncMeta;
  rows: MetricRow[];
  /** per-source sections; absent on every blob written before ADR-0010 */
  sources?: Partial<Record<MetricsSource, ReportMetricsSection>>;
}

/** The single, honest definition of "live data": a project is live once it has
 *  actually SYNCED rows — not the moment an Ads account is linked (linking and
 *  syncing are separate, non-atomic actions). Both the report resolver and the
 *  lighter `hasSyncedMetrics` accessor derive "live" from this one rule so the
 *  Monthly Report, the AI recap and the Settings/Overview labels never disagree.
 *  Framework-free; the type predicate lets the resolver narrow after the check.
 *
 *  Also the SHAPE guard for the stored blob. Both stores `JSON.parse` + cast, so a
 *  parseable-but-malformed blob (partial write, hand edit, schema drift) arrives
 *  typed as `ReportMetrics` while missing `rows` or `meta` — the callers then
 *  dereference `metrics.rows` / `metrics.meta.*` and a TypeError escapes into every
 *  report page. Checking the shape here degrades such a blob to "not live" (→ the
 *  sample dataset), which is what every caller already does for "never synced". */
export function isLiveMetrics(metrics: ReportMetrics | null): metrics is ReportMetrics {
  return isLiveSection(metrics);
}

/** The SAME "live" rule, applied to one section. A section counts only with a
 *  well-formed meta and at least one row — so a half-written / cleared section can
 *  never contribute a channel row to a blend, or be picked as the primary. */
export function isLiveSection(
  section: ReportMetricsSection | null | undefined
): section is ReportMetricsSection {
  return !!section && !!section.meta && Array.isArray(section.rows) && section.rows.length > 0;
}
