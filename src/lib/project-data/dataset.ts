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
import type { Project, ProjectType } from "@/lib/projects/types";

/** Stable 0..1 hash of the project id (FNV-1a), so a project's numbers are
 *  distinct but don't change between requests. */
function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Type baseline so an e-shop reads larger than a content project. */
const TYPE_BASE: Record<ProjectType, number> = { eshop: 1, app: 0.7, leadgen: 0.5, content: 0.45 };

/** Deterministic magnitude factor for a project (≈ type × 0.7–1.8). */
export function projectScale(project: Project): number {
  return TYPE_BASE[project.type] * (0.7 + seed01(project.id) * 1.1);
}

export function getProjectDataset(project: Project): PerformanceData {
  const k = projectScale(project);
  return {
    ...performance,
    client: {
      ...performance.client,
      name: project.name,
      domain: project.domain || performance.client.domain,
    },
    goals: { ...performance.goals, monthlyRevenue: Math.round(performance.goals.monthlyRevenue * k) },
    daily: performance.daily.map((d) => ({
      date: d.date,
      visits: Math.round(d.visits * k),
      cost: Math.round(d.cost * k),
      conversions: Math.round(d.conversions * k),
      revenue: Math.round(d.revenue * k),
    })),
  };
}
