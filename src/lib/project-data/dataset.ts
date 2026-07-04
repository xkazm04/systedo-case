/** Per-project data spine. `getProjectDataset` returns one coherent performance
 *  dataset for a project, derived deterministically from the project (id →
 *  magnitude, type → baseline, name/domain → labels) over the shared base series.
 *  The overview, dashboard and profit modules all read this, so every surface
 *  reflects the SAME per-project reality instead of the global demo numbers.
 *
 *  Live seam (Phase D): for a project with a connected Ads/analytics source,
 *  replace the scaled base with the project's synced data — the rest of the app
 *  consumes this shape unchanged. */
import { performance } from "@/lib/data";
import type { PerformanceData } from "@/lib/types";
import type { Project } from "@/lib/projects/types";
import { projectEfficiency, projectScale, seed01, seedScale, TYPE_BASE_FOR } from "./seed";

// The pure seeding primitives moved to ./seed (no data imports) so modules that
// only need a per-project factor don't transitively load this base dataset.
// Re-exported here for the existing call sites that import them from dataset.
export { seed01, seedScale, projectScale, projectEfficiency, TYPE_BASE_FOR };

/** Scale the base case-study dataset by a magnitude and relabel the client — the
 *  per-client spine for surfaces keyed by something other than a Project (e.g. a
 *  microsite slug), so each client reads as its own reality. `efficiency` (default
 *  1) divides cost independently of magnitude, so ROAS / PNO / CPA vary per client
 *  rather than being identical across scaled copies of one base. */
export function scaledDataset(
  scale: number,
  label: { name: string; domain?: string },
  efficiency = 1
): PerformanceData {
  return {
    ...performance,
    client: {
      ...performance.client,
      name: label.name,
      domain: label.domain || performance.client.domain,
    },
    goals: { ...performance.goals, monthlyRevenue: Math.round(performance.goals.monthlyRevenue * scale) },
    daily: performance.daily.map((d) => ({
      date: d.date,
      visits: Math.round(d.visits * scale),
      cost: Math.round((d.cost * scale) / efficiency),
      conversions: Math.round(d.conversions * scale),
      revenue: Math.round(d.revenue * scale),
    })),
  };
}

export function getProjectDataset(project: Project): PerformanceData {
  return scaledDataset(
    projectScale(project),
    { name: project.name, domain: project.domain || undefined },
    projectEfficiency(project)
  );
}
