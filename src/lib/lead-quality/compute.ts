/** Lead-quality math: cost per lead vs cost per *qualified* lead, qualification
 *  and win rates, ROI, and a composite quality score. Flags "junk" sources that
 *  are cheap per lead but low quality. Pure. */
import type { LeadSource, PeriodCounts } from "./sample";

export interface SourceMetrics extends LeadSource {
  cpl: number;
  qualRate: number;
  /** cost per qualified lead */
  cpql: number;
  winRate: number;
  /** revenue / spend; Infinity for unpaid sources */
  roi: number;
  /** composite 0..100 */
  qualityScore: number;
  /** cheap per lead but low qualification → junk */
  junk: boolean;
}

/** Qualification rate below which a *paid* source is flagged "junk" (cheap leads,
 *  poor quality). Exported so the UI's "under-performing source" picker keys off
 *  the same single threshold instead of duplicating the literal. */
export const JUNK_QUAL_RATE = 0.35;

export function withMetrics(s: LeadSource): SourceMetrics {
  const cpl = s.leads > 0 ? s.spend / s.leads : 0;
  const qualRate = s.leads > 0 ? s.qualified / s.leads : 0;
  const cpql = s.qualified > 0 ? s.spend / s.qualified : 0;
  const winRate = s.qualified > 0 ? s.won / s.qualified : 0;
  const roi = s.spend > 0 ? s.revenue / s.spend : Infinity;
  return {
    ...s,
    cpl,
    qualRate,
    cpql,
    winRate,
    roi,
    qualityScore: Math.round(100 * (0.6 * qualRate + 0.4 * winRate)),
    junk: s.spend > 0 && qualRate < JUNK_QUAL_RATE,
  };
}

export interface LeadQualitySummary {
  leads: number;
  qualified: number;
  won: number;
  blendedCpl: number;
  blendedCpql: number;
  junkCount: number;
}

export function summarize(sources: LeadSource[]): LeadQualitySummary {
  const rows = sources.map(withMetrics);
  const leads = rows.reduce((a, r) => a + r.leads, 0);
  const qualified = rows.reduce((a, r) => a + r.qualified, 0);
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  return {
    leads,
    qualified,
    won: rows.reduce((a, r) => a + r.won, 0),
    blendedCpl: leads > 0 ? spend / leads : 0,
    blendedCpql: qualified > 0 ? spend / qualified : 0,
    junkCount: rows.filter((r) => r.junk).length,
  };
}

/** One stage of the lead → close funnel: its absolute count, the conversion %
 *  from the *previous* stage (1 for the first stage), and the absolute drop-off
 *  lost since the previous stage. */
export interface FunnelStage {
  key: "leads" | "qualified" | "opportunities" | "won";
  label: string;
  count: number;
  /** count / previous count; 1 for the first (entry) stage */
  conversion: number;
  /** previous count − count; 0 for the first stage */
  dropOff: number;
}

export interface SourceFunnel {
  source: string;
  campaign?: string;
  stages: FunnelStage[];
  /** end-to-end leads → won */
  overallConversion: number;
}

const STAGE_LABELS = {
  leads: "Lead",
  qualified: "SQL",
  opportunities: "Příležitost",
  won: "Uzavřeno",
} as const;

/** Build the Lead → SQL → (Opportunity) → Won funnel for one source with
 *  per-step conversion and absolute drop-off. The opportunity stage is skipped
 *  when `opportunities` is absent, so a source without it degrades to the
 *  three-stage funnel without regression. */
export function sourceFunnel(s: LeadSource): SourceFunnel {
  const ordered: Array<{ key: FunnelStage["key"]; count: number }> = [
    { key: "leads", count: s.leads },
    { key: "qualified", count: s.qualified },
  ];
  if (typeof s.opportunities === "number") {
    ordered.push({ key: "opportunities", count: s.opportunities });
  }
  ordered.push({ key: "won", count: s.won });

  const stages: FunnelStage[] = ordered.map((stage, i) => {
    const prev = i > 0 ? ordered[i - 1].count : stage.count;
    return {
      key: stage.key,
      label: STAGE_LABELS[stage.key],
      count: stage.count,
      conversion: i === 0 ? 1 : prev > 0 ? stage.count / prev : 0,
      dropOff: i === 0 ? 0 : Math.max(0, prev - stage.count),
    };
  });

  return {
    source: s.source,
    campaign: s.campaign,
    stages,
    overallConversion: s.leads > 0 ? s.won / s.leads : 0,
  };
}

/** Funnels for every source, in input order. */
export function funnelBySource(sources: LeadSource[]): SourceFunnel[] {
  return sources.map(sourceFunnel);
}

/** Average days-in-stage. Each leg (qualify / close) is included only when its
 *  source field is present; `total` is the sum of the available legs, or null
 *  when no velocity data exists at all (→ hide the velocity view). */
export interface Velocity {
  daysToQualify: number | null;
  daysToClose: number | null;
  /** daysToQualify + daysToClose over the available legs; null if neither known */
  total: number | null;
}

const mean = (xs: number[]): number | null =>
  xs.length > 0 ? xs.reduce((a, x) => a + x, 0) / xs.length : null;

/** Blended average velocity across sources, weighting each source equally.
 *  Sources missing a leg are simply excluded from that leg's average — so a
 *  dataset with no velocity fields yields all-null (caller hides the view). */
export function avgVelocity(sources: LeadSource[]): Velocity {
  const toQualify = sources
    .map((s) => s.daysToQualify)
    .filter((d): d is number => typeof d === "number");
  const toClose = sources
    .map((s) => s.daysToClose)
    .filter((d): d is number => typeof d === "number");

  const daysToQualify = mean(toQualify);
  const daysToClose = mean(toClose);
  const total =
    daysToQualify === null && daysToClose === null
      ? null
      : (daysToQualify ?? 0) + (daysToClose ?? 0);

  return { daysToQualify, daysToClose, total };
}

/** ── Period-over-period drift watch (CPQL / qualification / win rate) ──────────
 *  A single static snapshot hides whether a source is getting *worse*. Given a
 *  source's current and prior-period counts we compute the relative change in
 *  CPQL, qualification rate and win rate, then raise threshold alerts (e.g. CPQL
 *  rose >25 % or blew past its target). Pure — same input → same output. */

/** Relative-change threshold (fraction) above which a CPQL *rise* is alert-worthy. */
export const CPQL_ALERT_RISE = 0.25;
/** Default CPQL target (CZK / qualified lead) a paid source should stay under. */
export const CPQL_TARGET_CZK = 900;

/** Relative change `(curr − prev) / prev`. Null when there's no usable baseline
 *  (prev ≤ 0) so the caller can render "—" instead of a divide-by-zero ∞/NaN. */
function relDelta(curr: number, prev: number): number | null {
  return prev > 0 ? (curr - prev) / prev : null;
}

const cpqlOf = (c: PeriodCounts): number => (c.qualified > 0 ? c.spend / c.qualified : 0);
const qualRateOf = (c: PeriodCounts): number => (c.leads > 0 ? c.qualified / c.leads : 0);
const winRateOf = (c: PeriodCounts): number => (c.won > 0 && c.qualified > 0 ? c.won / c.qualified : 0);

export interface SourceTrend {
  source: string;
  /** the source is paid (spend > 0) in the current period → CPQL is meaningful */
  paid: boolean;
  cpqlNow: number;
  cpqlPrev: number;
  /** relative change in CPQL; null when no baseline or unpaid (rise = worse) */
  cpqlDelta: number | null;
  /** relative change in qualification rate; null when no baseline (rise = better) */
  qualRateDelta: number | null;
  /** relative change in win rate; null when no baseline (rise = better) */
  winRateDelta: number | null;
}

/** Build the period-over-period trend for one source. Returns null when the
 *  source has no prior-period data (the row simply shows no trend). */
export function sourceTrend(s: LeadSource): SourceTrend | null {
  if (!s.prior) return null;
  const curr: PeriodCounts = { leads: s.leads, qualified: s.qualified, won: s.won, spend: s.spend };
  const prev = s.prior;
  const paid = s.spend > 0;
  const cpqlNow = cpqlOf(curr);
  const cpqlPrev = cpqlOf(prev);
  return {
    source: s.source,
    paid,
    cpqlNow,
    cpqlPrev,
    // CPQL drift only makes sense while the source is actually being paid for.
    cpqlDelta: paid ? relDelta(cpqlNow, cpqlPrev) : null,
    qualRateDelta: relDelta(qualRateOf(curr), qualRateOf(prev)),
    winRateDelta: relDelta(winRateOf(curr), winRateOf(prev)),
  };
}

/** Trends for every source carrying prior-period data, in input order. */
export function trendBySource(sources: LeadSource[]): SourceTrend[] {
  return sources.map(sourceTrend).filter((t): t is SourceTrend => t !== null);
}

export type AlertKind = "cpql-rise" | "cpql-target";
export type AlertSeverity = "warning" | "critical";

export interface LeadQualityAlert {
  source: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Czech, ready-to-render alert sentence */
  message: string;
}

/** Options for the drift alerts; both default to the module constants so callers
 *  may override the target/rise per project without re-implementing the rule. */
export interface AlertOptions {
  /** relative CPQL rise that trips a "drift" warning (default {@link CPQL_ALERT_RISE}) */
  riseThreshold?: number;
  /** absolute CPQL target the source should stay under (default {@link CPQL_TARGET_CZK}) */
  targetCzk?: number;
}

/** Format a fraction as a whole-percent string for alert copy ("26 %"). Kept
 *  local so the pure layer has no formatter dependency. */
const pctText = (fraction: number): string => `${Math.round(Math.abs(fraction) * 100)} %`;
const czkText = (n: number): string => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;

/** Threshold alerts for one source's trend: a CPQL rise beyond the threshold
 *  ("vzrostlo o >25 %") and/or CPQL over target ("překračuje cíl"). A paid
 *  source whose CPQL is flat and on-target yields no alerts. */
export function sourceAlerts(t: SourceTrend, opts: AlertOptions = {}): LeadQualityAlert[] {
  const riseThreshold = opts.riseThreshold ?? CPQL_ALERT_RISE;
  const targetCzk = opts.targetCzk ?? CPQL_TARGET_CZK;
  const alerts: LeadQualityAlert[] = [];
  if (!t.paid) return alerts; // CPQL undefined for unpaid sources → nothing to alert

  if (t.cpqlDelta !== null && t.cpqlDelta > riseThreshold) {
    alerts.push({
      source: t.source,
      kind: "cpql-rise",
      severity: "warning",
      message: `CPQL zdroje „${t.source}” vzrostlo o ${pctText(t.cpqlDelta)} oproti minulému období.`,
    });
  }
  if (t.cpqlNow > targetCzk) {
    alerts.push({
      source: t.source,
      kind: "cpql-target",
      severity: "critical",
      message: `CPQL zdroje „${t.source}” (${czkText(t.cpqlNow)}) překračuje cíl ${czkText(targetCzk)}.`,
    });
  }
  return alerts;
}

/** Every drift alert across all sources that carry a trend, in source order. */
export function periodAlerts(sources: LeadSource[], opts: AlertOptions = {}): LeadQualityAlert[] {
  return trendBySource(sources).flatMap((t) => sourceAlerts(t, opts));
}
