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
