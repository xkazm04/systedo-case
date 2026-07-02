/** Pure per-project seeding primitives (no data imports), so modules that only
 *  need a deterministic per-project factor (see vary.ts) don't transitively pull
 *  in the base performance dataset. dataset.ts re-exports these for back-compat. */
import type { Project, ProjectType } from "@/lib/projects/types";

/** Stable 0..1 hash of a seed string (FNV-1a), so derived numbers are distinct
 *  but don't change between requests. */
export function seed01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** Type baseline so an e-shop reads larger than a content project. */
const TYPE_BASE: Record<ProjectType, number> = { eshop: 1, app: 0.7, leadgen: 0.5, content: 0.45 };

/** Public accessor for the per-type baseline magnitude, so other seeded modules
 *  (see project-data/vary.ts) scale consistently with the dataset spine. */
export function TYPE_BASE_FOR(type: ProjectType): number {
  return TYPE_BASE[type];
}

/** Deterministic magnitude factor from a seed string (≈ base × 0.7–1.8). */
export function seedScale(seed: string, base = 1): number {
  return base * (0.7 + seed01(seed) * 1.1);
}

/** Deterministic magnitude factor for a project (≈ type × 0.7–1.8). */
export function projectScale(project: Project): number {
  return seedScale(project.id, TYPE_BASE[project.type]);
}
