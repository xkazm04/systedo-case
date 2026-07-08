/** C2 grounding appendix: lead-source quality, CPL/CPQL and velocity for leadgen /
 *  local projects, so the recap speaks to a CRO's real levers — which sources are
 *  junk, cost per QUALIFIED lead, how fast leads move — instead of e-commerce
 *  revenue the business doesn't have. Rides on the recap's USER prompt only (the
 *  system+schema fingerprint is unchanged). Czech, matching snapshotToPromptText.
 *  Pure & testable; null for types without a lead funnel. */
import type { Project } from "@/lib/projects/types";
import { sourcesForProject } from "@/lib/lead-quality/sample";
import { summarize, withMetrics, avgVelocity } from "@/lib/lead-quality/compute";
import { fmtCZK, fmtInt, fmtPct } from "@/lib/format";

/** A lead-quality grounding block for a leadgen/local project, or null otherwise. */
export function leadSignalsPromptText(project: Project): string | null {
  if (project.type !== "leadgen" && project.type !== "local") return null;
  const sources = sourcesForProject(project);
  if (sources.length === 0) return null;

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
