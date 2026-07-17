/** C2 grounding appendix: lead-source quality, CPL/CPQL and velocity for leadgen /
 *  local projects, so the recap speaks to a CRO's real levers — which sources are
 *  junk, cost per QUALIFIED lead, how fast leads move — instead of e-commerce
 *  revenue the business doesn't have. Rides on the recap's USER prompt only (the
 *  system+schema fingerprint is unchanged). Czech, matching snapshotToPromptText.
 *  Pure & testable; null for types without a lead funnel. */
import type { Project } from "@/lib/projects/types";
import { sourcesForProject, type LeadSource } from "@/lib/lead-quality/sample";
import { summarize, withMetrics, avgVelocity } from "@/lib/lead-quality/compute";
import { resolveLeadSources } from "@/lib/lead-quality/resolve";
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
  // Independent per-field rounding at a small scale factor can break the funnel
  // invariant (qualified > leads, won > opportunities), producing impossible narratives
  // like "Leadů: 1, kvalifikovaných: 2" or flipping a source's junk flag vs the on-screen
  // table. Clamp each stage to its parent AFTER the residual patch. Clamps only ever
  // lower a count, so the leads sum still matches the tile exactly.
  return scaled.map((s) => {
    const leads = Math.max(0, s.leads);
    const qualified = Math.min(s.qualified, leads);
    const opportunities = s.opportunities != null ? Math.min(s.opportunities, qualified) : undefined;
    const won = Math.min(s.won, opportunities ?? qualified);
    return {
      ...s,
      leads,
      qualified,
      won,
      ...(opportunities != null ? { opportunities } : {}),
      ...(s.prior
        ? {
            prior: {
              ...s.prior,
              qualified: Math.min(s.prior.qualified, s.prior.leads),
              won: Math.min(s.prior.won, Math.min(s.prior.qualified, s.prior.leads)),
            },
          }
        : {}),
    };
  });
}

/** Build the lead-quality grounding block from a resolved source set. `live` marks
 *  the provenance honestly (imported CRM leads vs the illustrative sample) — the
 *  integrity rule: the AI grounding must never present sample data as live. Scaling
 *  to the report tile (R02) only applies to the SAMPLE spine — imported leads are
 *  ground truth and are never rescaled. Pure; null for an empty set. */
export function leadSignalsText(
  sources: LeadSource[],
  opts: { targetLeads?: number; live: boolean }
): string | null {
  if (sources.length === 0) return null;
  const { targetLeads, live } = opts;
  const scaled =
    !live && targetLeads != null && targetLeads > 0 ? scaleSourcesToLeads(sources, targetLeads) : sources;

  const rows = scaled.map(withMetrics);
  const sum = summarize(scaled);
  const vel = avgVelocity(scaled);
  const junk = rows.filter((r) => r.junk).sort((a, b) => a.qualRate - b.qualRate);
  const best = [...rows].sort((a, b) => b.qualityScore - a.qualityScore)[0];
  const qualRate = sum.leads > 0 ? sum.qualified / sum.leads : 0;

  const header = live
    ? "Kvalita a zdroje leadů (reálná importovaná data z CRM — report na ně nesmí mlčet):"
    : "Kvalita a zdroje leadů (reálná, už spočítaná data — report na ně nesmí mlčet):";
  const lines: string[] = [
    header,
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

/** A lead-quality grounding block for a leadgen/local project, or null otherwise,
 *  computed over the SAMPLE spine. `targetLeads` (the report's period lead total)
 *  reconciles the counts with the tile (R02); omit it to keep the raw sample totals.
 *  Pure + sync — the sample-only path (its output is byte-identical to before this
 *  became provenance-aware). For the live-over-sample path, use
 *  {@link resolveLeadSignalsPromptText}. */
export function leadSignalsPromptText(project: Project, targetLeads?: number): string | null {
  if (project.type !== "leadgen" && project.type !== "local") return null;
  const raw = sourcesForProject(project);
  return leadSignalsText(raw, { targetLeads, live: false });
}

/** The recap's lead-quality grounding, resolving IMPORTED leads over the sample:
 *  when the project has imported CRM leads the block computes over them (labelled
 *  live) and reports the import's timestamp as a cache `version` so a re-import
 *  can't be served a stale recap; otherwise it falls back to the sample spine
 *  (byte-identical, no version). Leadgen/local only. Server-only. Never throws. */
export async function resolveLeadSignals(
  project: Project,
  targetLeads?: number
): Promise<{ text: string | null; version?: string }> {
  if (project.type !== "leadgen" && project.type !== "local") return { text: null };
  const sample = sourcesForProject(project);
  const resolved = await resolveLeadSources(project.id, sample);
  return {
    text: leadSignalsText(resolved.sources, { targetLeads, live: resolved.live }),
    version: resolved.live ? resolved.syncedAt : undefined,
  };
}

/** Text-only convenience over {@link resolveLeadSignals} for grounding paths that
 *  key their cache by project alone (LP-variant ideas). */
export async function resolveLeadSignalsPromptText(
  project: Project,
  targetLeads?: number
): Promise<string | null> {
  return (await resolveLeadSignals(project, targetLeads)).text;
}
