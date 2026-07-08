/** C2 grounding appendix: lead-source quality, CPL/CPQL and velocity for leadgen /
 *  local projects, so the recap speaks to a CRO's real levers — which sources are
 *  junk, cost per QUALIFIED lead, how fast leads move — instead of e-commerce
 *  revenue the business doesn't have. Rides on the recap's USER prompt only (the
 *  system+schema fingerprint is unchanged). Czech, matching snapshotToPromptText.
 *  Pure & testable; null for types without a lead funnel. */
import type { Project } from "@/lib/projects/types";
import { sourcesForProject, type LeadSource } from "@/lib/lead-quality/sample";
import { summarize, withMetrics, avgVelocity } from "@/lib/lead-quality/compute";
import { fmtCZK, fmtInt, fmtPct } from "@/lib/format";

/** R02: reconcile the lead-quality source breakdown with the report tile. The tile
 *  reads the dataset's period conversions; this block sums an independent sample
 *  spine — so "Leady: X" (tile) and "Leadů: Y" (narrative) diverged. Scaling every
 *  count/spend/revenue field by one factor makes the totals match the tile while
 *  leaving all RATIOS (CPL, CPQL, qualification rate, junk flag, velocity) untouched.
 *  `targetLeads` = the period-scoped conversion total; absent → unscaled sample. */
function scaleSourcesToLeads(sources: LeadSource[], targetLeads: number): LeadSource[] {
  const rawLeads = sources.reduce((a, s) => a + s.leads, 0);
  if (rawLeads <= 0) return sources;
  const f = targetLeads / rawLeads;
  const sc = (n: number) => Math.round(n * f);
  const scaled = sources.map((s) => ({
    ...s,
    leads: sc(s.leads),
    qualified: sc(s.qualified),
    won: sc(s.won),
    spend: sc(s.spend),
    revenue: sc(s.revenue),
    ...(s.opportunities != null ? { opportunities: sc(s.opportunities) } : {}),
    ...(s.prior
      ? { prior: { leads: sc(s.prior.leads), qualified: sc(s.prior.qualified), won: sc(s.prior.won), spend: sc(s.prior.spend) } }
      : {}),
  }));
  // Rounding per source can drift the sum ±1–2 from the target; assign the residual
  // to the largest source so the narrative total matches the tile EXACTLY.
  const residual = targetLeads - scaled.reduce((a, s) => a + s.leads, 0);
  if (residual !== 0) {
    const largest = scaled.reduce((max, s) => (s.leads > max.leads ? s : max), scaled[0]);
    largest.leads += residual;
  }
  return scaled;
}

/** A lead-quality grounding block for a leadgen/local project, or null otherwise.
 *  `targetLeads` (the report's period lead total) reconciles the counts with the
 *  tile (R02); omit it to keep the raw sample totals. */
export function leadSignalsPromptText(project: Project, targetLeads?: number): string | null {
  if (project.type !== "leadgen" && project.type !== "local") return null;
  const raw = sourcesForProject(project);
  if (raw.length === 0) return null;
  const sources = targetLeads != null && targetLeads > 0 ? scaleSourcesToLeads(raw, targetLeads) : raw;

  const rows = sources.map(withMetrics);
  const sum = summarize(sources);
  const vel = avgVelocity(sources);
  const junk = rows.filter((r) => r.junk).sort((a, b) => a.qualRate - b.qualRate);
  const best = [...rows].sort((a, b) => b.qualityScore - a.qualityScore)[0];
  const qualRate = sum.leads > 0 ? sum.qualified / sum.leads : 0;

  const lines: string[] = [
    "Kvalita a zdroje leadů (reálná, už spočítaná data — report na ně nesmí mlčet):",
    `- Leadů: ${fmtInt(sum.leads)}; kvalifikovaných: ${fmtInt(sum.qualified)} (${fmtPct(qualRate)}); vyhraných: ${fmtInt(sum.won)}`,
    `- Cena za lead (CPL): ${fmtCZK(sum.blendedCpl)}; cena za kvalifikovaný lead (CPQL): ${fmtCZK(sum.blendedCpql)}`,
    junk.length > 0
      ? `- Junk zdroje (levné, ale nízká kvalifikace): ${junk
          .map((j) => `${j.source} — kvalifikace ${fmtPct(j.qualRate)}, CPQL ${fmtCZK(j.cpql)}`)
          .join("; ")}`
      : "- Žádný placený zdroj není označen jako junk.",
  ];
  if (best) {
    lines.push(
      `- Nejkvalitnější zdroj: ${best.source} — skóre ${Math.round(best.qualityScore)}/100, kvalifikace ${fmtPct(
        best.qualRate
      )}, CPQL ${fmtCZK(best.cpql)}`
    );
  }
  if (vel.total != null) {
    const parts: string[] = [];
    if (vel.daysToQualify != null) parts.push(`${vel.daysToQualify.toFixed(0)} dní do kvalifikace`);
    if (vel.daysToClose != null) parts.push(`${vel.daysToClose.toFixed(0)} dní do uzavření`);
    lines.push(`- Rychlost leadů (velocity): ${parts.join(", ")}`);
  }
  return lines.join("\n");
}
