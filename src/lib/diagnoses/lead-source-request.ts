/** Shared, server-usable builder for the lead-source-diagnosis request + the
 *  per-source "seed" projection. Extracted from LeadQualityModule (seed building)
 *  and LeadSourceDiagnosisPanel (seed → request) so the SAME real-numbers-only
 *  mapping the gate-tracked `lead-source-diagnosis` tool reads is reused by the
 *  module, the panel (on click) and the weekly-digest cron (Direction 2) rather
 *  than duplicated. Framework-free + pure; imports only the pure lead-quality
 *  compute helpers (client-safe). */
import type { LeadSourceDiagnosisRequest, LeadSourcePeer } from "../ai-types";
import { sourceAlerts, sourceTrend, type SourceMetrics } from "../lead-quality/compute";

/** The few real numbers the diagnosis needs per source — a projection built from
 *  the computed source metrics, so no compute / sample data ships with the client. */
export interface LeadSourceSeed {
  source: string;
  leads: number;
  qualified: number;
  won: number;
  qualRate: number;
  winRate: number;
  /** only set for paid sources */
  spend?: number;
  cpl?: number;
  costPerQualified?: number;
  /** flagged as junk by the module's threshold (drives the badge) */
  junk: boolean;
  /** other sources' compact metrics (best-first) for budget-shift comparison */
  peers?: LeadSourcePeer[];
  /** period-over-period drift for this source (relative deltas), when it has prior data */
  trend?: { cpqlDelta: number | null; qualRateDelta: number | null; winRateDelta: number | null };
  /** average lead → close velocity in days, when known */
  velocityDays?: number;
  /** period alert sentences already raised for this source (CPQL rise / over target) */
  alerts?: string[];
  /** WP W3-C — this source's 30-day CONVERSION-LEDGER counts, when the project has a
   *  rollup. Aggregate counts only; never a contact or a click id. */
  conversions?: { qualified30d: number; won30d: number; gclidPct: number };
}

/** Per-source conversion counts, keyed by the DISPLAY source label — the same key
 *  `aggregate.ts#sourceLabel` produces and `SourceMetrics.source` carries, which is
 *  what lets the ledger and the funnel be joined without a second identifier. */
export type ConversionsByLabel = Readonly<
  Record<string, { qualified30d: number; won30d: number; gclidPct: number }>
>;

/** Win rate below which a source that otherwise qualifies still under-performs
 *  (qualified leads that rarely close → a fit / targeting problem). */
export const WEAK_WIN_RATE = 0.15;

/** Project one computed source row down to the seed the diagnosis reads, threading
 *  its drift / velocity / live alerts and a best-first peer set for budget-shift
 *  comparison. `allRows` supplies the peers. */
export function toLeadSourceSeed(
  r: SourceMetrics,
  allRows: SourceMetrics[],
  conversions?: ConversionsByLabel
): LeadSourceSeed {
  const seed: LeadSourceSeed = {
    source: r.source,
    leads: r.leads,
    qualified: r.qualified,
    won: r.won,
    qualRate: r.qualRate,
    winRate: r.winRate,
    junk: r.junk,
  };
  if (r.spend > 0) {
    seed.spend = r.spend;
    seed.cpl = r.cpl;
    seed.costPerQualified = r.cpql;
  }
  const tr = sourceTrend(r);
  if (tr && (tr.cpqlDelta !== null || tr.qualRateDelta !== null || tr.winRateDelta !== null)) {
    seed.trend = { cpqlDelta: tr.cpqlDelta, qualRateDelta: tr.qualRateDelta, winRateDelta: tr.winRateDelta };
  }
  if (r.daysToQualify != null || r.daysToClose != null) {
    seed.velocityDays = (r.daysToQualify ?? 0) + (r.daysToClose ?? 0);
  }
  const rowAlerts = tr ? sourceAlerts(tr).map((a) => a.message) : [];
  if (rowAlerts.length > 0) seed.alerts = rowAlerts;
  const peers = allRows
    .filter((p) => p.source !== r.source)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 3)
    .map((p) => ({
      source: p.source,
      qualRate: p.qualRate,
      winRate: p.winRate,
      ...(p.spend > 0 ? { costPerQualified: p.cpql } : {}),
    }));
  if (peers.length > 0) seed.peers = peers;
  // WP W3-C — join the conversion ledger's 30-day counts for THIS source. Absent
  // key ⇒ absent field ⇒ the prompt omits the line entirely (never a fabricated 0,
  // which would tell the model the source converted nothing).
  const conv = conversions?.[r.source];
  if (conv) seed.conversions = conv;
  return seed;
}

/** The under-performing sources the diagnosis should offer: junk (cheap but low
 *  quality) or sources that qualify yet rarely close. If none stand out, the
 *  weakest source by quality score, so an action is always available. `rows` must
 *  be sorted best-first by quality score (as the module builds it). */
export function underperformingRows(rows: SourceMetrics[]): SourceMetrics[] {
  const under = rows.filter((r) => r.junk || r.winRate < WEAK_WIN_RATE);
  return under.length > 0 ? under : rows.slice(-1);
}

/** Build the seeds the diagnosis panel offers, from the computed source rows.
 *  `conversions` (WP W3-C) is the per-label conversion-ledger join; every caller that
 *  can reach the rollup must pass the SAME map, because the seed feeds `inputDigest`
 *  and two call sites disagreeing would badge every stored diagnosis stale. */
export function buildLeadSourceSeeds(
  rows: SourceMetrics[],
  conversions?: ConversionsByLabel
): LeadSourceSeed[] {
  return underperformingRows(rows).map((r) => toLeadSourceSeed(r, rows, conversions));
}

/** Build the request from a picked seed (identical to the panel's former inline
 *  builder). */
export function seedToRequest(seed: LeadSourceSeed): LeadSourceDiagnosisRequest {
  const req: LeadSourceDiagnosisRequest = {
    source: seed.source,
    leads: seed.leads,
    qualified: seed.qualified,
    won: seed.won,
    qualRate: seed.qualRate,
    winRate: seed.winRate,
  };
  if (seed.spend != null && seed.spend > 0) req.spend = seed.spend;
  if (seed.cpl != null) req.cpl = seed.cpl;
  if (seed.costPerQualified != null) req.costPerQualified = seed.costPerQualified;
  if (seed.peers && seed.peers.length > 0) req.peers = seed.peers;
  if (seed.trend) req.trend = seed.trend;
  if (seed.velocityDays != null && seed.velocityDays > 0) req.velocityDays = seed.velocityDays;
  if (seed.alerts && seed.alerts.length > 0) req.alerts = seed.alerts;
  if (seed.conversions) req.conversions = seed.conversions; // W3-C
  return req;
}
