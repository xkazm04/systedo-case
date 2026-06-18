/** Lead-quality math: cost per lead vs cost per *qualified* lead, qualification
 *  and win rates, ROI, and a composite quality score. Flags "junk" sources that
 *  are cheap per lead but low quality. Pure. */
import type { LeadSource } from "./sample";

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

const JUNK_QUAL_RATE = 0.35;

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
