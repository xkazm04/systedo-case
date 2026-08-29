/** ADR-0010 — the channel ledger's PURE read-time derivation. A project holds one
 *  `{meta, rows}` section per ad platform; this file turns those sections into the
 *  single blended series the report spine consumes, plus a REAL platform channel
 *  mix (the platform *is* the channel — see ADR-0010's "Decision" §3).
 *
 *  Framework-free (type-only imports, no store, no clock, no Next), so every rule
 *  below is unit-testable without a database. The resolver is the only caller.
 *
 *  Three rules the rest of the module leans on:
 *   1. LEGACY READ — a blob without `sources` reads as exactly one section, the one
 *      its own `meta.source` names. So a project synced before ADR-0010 blends to
 *      itself and the report is byte-identical to before.
 *   2. PRIMARY — `sources["google-ads"] ?? sources["sklik"]`. The primary drives the
 *      blob's legacy top-level `meta`/`rows`, the report's provenance labels, and is
 *      what a refused blend falls back to.
 *   3. NEVER BLEND ACROSS CURRENCIES — the stored amounts are each account's native
 *      money (the sync converts nothing), so summing a EUR account into a CZK one
 *      would fabricate a total. A mixed-currency project serves the PRIMARY section
 *      alone and says so through `mixedCurrency`, which reaches ResolvedDataset. */
import type { ChannelDailyShare, ChannelShare, ChannelShareDims } from "@/lib/types";
import type { DailyPoint } from "@/lib/campaigns/types";
import {
  coerceMetricsSource,
  isLiveSection,
  METRICS_SOURCES,
  type MetricRow,
  type MetricsSource,
  type ReportMetrics,
  type ReportMetricsSection,
} from "./types";

/** The sections of a project, keyed by source. Ordered by METRICS_SOURCES. */
export type MetricsSections = Partial<Record<MetricsSource, ReportMetricsSection>>;

/** Presentation of one platform as a report channel. Labels are platform names
 *  (locale-neutral proper nouns); the colours are the two the sample dataset
 *  already uses for the same two platforms, so a live mix and the case-study mix
 *  read as the same chart. */
const CHANNEL_PRESENTATION: Record<MetricsSource, { channel: string; color: string }> = {
  "google-ads": { channel: "Google Ads", color: "#1f8f88" },
  sklik: { channel: "Sklik", color: "#15324b" },
};

/** The base currency every un-labelled section is treated as (the sync stamps a
 *  code only when the account reported one; absent has always meant CZK). */
const BASE_CURRENCY = "CZK";

export interface Blended {
  /** the series the report runs on: per-day sum across the blended sections, or the
   *  PRIMARY section's own rows when there is one section / a currency mismatch */
  rows: MetricRow[];
  /** one channel per blended platform, from the section totals. EMPTY for a single
   *  section (an account-level sync cannot substantiate a mix) and for a refused
   *  blend — which is exactly what buildLiveDataset did before ADR-0010. */
  channels: ChannelShare[];
  /** one point per day, `shares` index-parallel to `channels` (PerformanceData's
   *  ChannelDailyShare contract). Present only alongside a non-empty `channels`. */
  channelDaily?: ChannelDailyShare[];
  /** every live source the project holds, blend order — even when the blend was
   *  refused, so the caller can say "two networks, one shown" honestly */
  sources: MetricsSource[];
  /** true when the live sections disagree on currency → `rows` is the PRIMARY
   *  section only and `channels` is empty. Never true below two sections. */
  mixedCurrency: boolean;
}

/** The project's live sections, in blend order, honouring the legacy-read rule.
 *  Sections that fail the per-section live rule (no rows / no meta) are dropped, so
 *  a cleared or half-written section can never contribute to a blend. */
export function readSections(metrics: ReportMetrics | null | undefined): MetricsSections {
  if (!metrics) return {};
  const out: MetricsSections = {};
  const stored = metrics.sources;
  if (stored) {
    for (const source of METRICS_SOURCES) {
      const section = stored[source];
      if (isLiveSection(section)) out[source] = section;
    }
    if (Object.keys(out).length > 0) return out;
  }
  // Legacy blob (or a `sources` map with nothing live in it): the top-level pair IS
  // the one section, attributed to the source its own meta names.
  if (isLiveSection(metrics)) out[coerceMetricsSource(metrics.meta.source)] = { meta: metrics.meta, rows: metrics.rows };
  return out;
}

/** Google when present, else Sklik, else null — the section whose meta is the blob's
 *  legacy top-level meta and whose provenance the report labels. */
export function primarySection(sections: MetricsSections): ReportMetricsSection | null {
  for (const source of METRICS_SOURCES) {
    const section = sections[source];
    if (section) return section;
  }
  return null;
}

/** The source name of {@link primarySection}, or null when there is none. */
export function primarySource(sections: MetricsSections): MetricsSource | null {
  for (const source of METRICS_SOURCES) if (sections[source]) return source;
  return null;
}

/** A section's currency for blend purposes: its captured code, else the base CZK
 *  (absent has always meant "treat as the base"). Upper-cased so a stored "czk"
 *  can't read as a second currency and refuse a perfectly blendable pair. */
function sectionCurrency(section: ReportMetricsSection): string {
  return (section.meta.currencyCode ?? BASE_CURRENCY).toUpperCase();
}

const DIMS = ["visits", "cost", "conversions", "revenue"] as const;

/** Per-day sum of several sections' rows. `visits`/`cost`/`conversions`/`revenue`
 *  are always summed. The OPTIONAL paid-traffic pair is emitted for a day only when
 *  EVERY row contributing to that day carried it: a partial sum (one network's
 *  clicks presented as the day's total) would silently understate CTR/CPC for the
 *  blended series, and the fields exist precisely so a consumer can tell "not
 *  captured" from "zero". Absent is the honest answer. */
function sumRows(rowSets: MetricRow[][]): MetricRow[] {
  const acc = new Map<
    string,
    { row: MetricRow; clicks: number; impressions: number; parts: number }
  >();
  for (const rows of rowSets) {
    for (const r of rows) {
      if (!r?.date) continue;
      const entry =
        acc.get(r.date) ??
        {
          row: { date: r.date, visits: 0, cost: 0, conversions: 0, revenue: 0 },
          clicks: 0,
          impressions: 0,
          parts: 0,
        };
      entry.row.visits += r.visits ?? 0;
      entry.row.cost += r.cost ?? 0;
      entry.row.conversions += r.conversions ?? 0;
      entry.row.revenue += r.revenue ?? 0;
      if (typeof r.clicks === "number") entry.clicks += 1;
      if (typeof r.impressions === "number") entry.impressions += 1;
      entry.parts += 1;
      acc.set(r.date, entry);
    }
  }
  // Second pass for the optional pair, so "every part carried it" is decidable.
  for (const rows of rowSets) {
    for (const r of rows) {
      const entry = r?.date ? acc.get(r.date) : undefined;
      if (!entry) continue;
      if (entry.clicks === entry.parts && typeof r.clicks === "number") {
        entry.row.clicks = (entry.row.clicks ?? 0) + r.clicks;
      }
      if (entry.impressions === entry.parts && typeof r.impressions === "number") {
        entry.row.impressions = (entry.row.impressions ?? 0) + r.impressions;
      }
    }
  }
  return [...acc.values()].map(({ row }) => row).sort((a, b) => a.date.localeCompare(b.date));
}

/** Totals of one section's rows, per share dimension. */
function totals(rows: MetricRow[]): ChannelShareDims {
  const t: ChannelShareDims = { visits: 0, cost: 0, conversions: 0, revenue: 0 };
  for (const r of rows) {
    t.visits += r.visits ?? 0;
    t.cost += r.cost ?? 0;
    t.conversions += r.conversions ?? 0;
    t.revenue += r.revenue ?? 0;
  }
  return t;
}

/** Per-dimension shares of `part` within `whole`. A zero denominator yields 0 (not
 *  NaN): a day/dimension nobody spent on has no mix to report, and NaN would
 *  poison every downstream chart and delta. */
function sharesOf(part: ChannelShareDims, whole: ChannelShareDims): ChannelShareDims {
  const out = { visits: 0, cost: 0, conversions: 0, revenue: 0 };
  for (const dim of DIMS) out[dim] = whole[dim] > 0 ? part[dim] / whole[dim] : 0;
  return out;
}

/** The blended read of a project's stored metrics. See the file header for the
 *  three rules; `metrics` is the raw stored blob (legacy or sectioned). */
export function blendSections(metrics: ReportMetrics | null | undefined): Blended {
  const sections = readSections(metrics);
  const sources = METRICS_SOURCES.filter((s) => sections[s]);
  const primary = primarySection(sections);
  if (!primary) return { rows: [], channels: [], sources: [], mixedCurrency: false };

  // One section — the overwhelmingly common case, and the byte-identity guarantee:
  // its own rows, no channel mix, exactly what the resolver built before ADR-0010.
  if (sources.length < 2) {
    return { rows: primary.rows, channels: [], sources, mixedCurrency: false };
  }

  // Rule 3: never blend across currencies. Serve the primary alone and say so.
  const currencies = new Set(sources.map((s) => sectionCurrency(sections[s]!)));
  if (currencies.size > 1) {
    return { rows: primary.rows, channels: [], sources, mixedCurrency: true };
  }

  const rows = sumRows(sources.map((s) => sections[s]!.rows));
  const perSource = sources.map((s) => ({ source: s, totals: totals(sections[s]!.rows) }));
  const grand = totals(rows);
  const channels: ChannelShare[] = perSource.map(({ source, totals: t }) => ({
    ...CHANNEL_PRESENTATION[source],
    shares: sharesOf(t, grand),
  }));

  // The time dimension: each day's mix computed from that day's own per-source
  // totals, so a mix SHIFT (budget moving between networks) is visible rather than
  // the flat aggregate mix projected onto every day.
  const byDate = sources.map((s) => new Map(sections[s]!.rows.map((r) => [r.date, r])));
  const channelDaily: ChannelDailyShare[] = rows.map((day) => {
    const dayTotals = byDate.map((m) => {
      const r = m.get(day.date);
      return r ? totals([r]) : { visits: 0, cost: 0, conversions: 0, revenue: 0 };
    });
    const dayGrand = totals([day]);
    return { date: day.date, shares: dayTotals.map((t) => sharesOf(t, dayGrand)) };
  });

  return { rows, channels, channelDaily, sources, mixedCurrency: false };
}

/** Sklik's portfolio `DailyPoint` series → the report's `MetricRow` series.
 *
 *  Lives here (not in map.ts, which is the Google searchStream mapper) because it is
 *  the other pure half of the section spine and this module is the WP's pure file.
 *  `visits` is the clicks stand-in exactly as the Ads mapper does it, `revenue` is
 *  the attributed conversion value, and the optional paid pair is carried only when
 *  the point actually has it. Money is NOT rescaled: the adapter already applied the
 *  connection's confirmed haléře/CZK mode, so these are native CZK. */
export function sklikPointsToMetricRows(points: DailyPoint[]): MetricRow[] {
  return [...points]
    .map((p) => ({
      date: p.date,
      visits: Math.round(p.clicks ?? 0),
      cost: Math.round(p.cost ?? 0),
      conversions: p.conversions ?? 0,
      revenue: Math.round(p.conversionValue ?? 0),
      ...(typeof p.clicks === "number" ? { clicks: Math.round(p.clicks) } : {}),
      ...(typeof p.impressions === "number" ? { impressions: Math.round(p.impressions) } : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
