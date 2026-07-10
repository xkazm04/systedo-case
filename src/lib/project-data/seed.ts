/** Pure per-project seeding primitives (no data imports), so modules that only
 *  need a deterministic per-project factor (see vary.ts) don't transitively pull
 *  in the base performance dataset. dataset.ts re-exports these for back-compat. */
import type { Project, ProjectType } from "@/lib/projects/types";
// Shared demo core — the same FNV-1a hash the campaign/keyword samples and the
// dashboard seed script use (one implementation instead of copies).
import { hashStr } from "@/lib/demo/prng.mjs";

/** Stable 0..1 hash of a seed string (FNV-1a), so derived numbers are distinct
 *  but don't change between requests. */
export function seed01(id: string): number {
  return (hashStr(id) % 10_000) / 10_000;
}

/** Type baseline so an e-shop reads larger than a content project. */
const TYPE_BASE: Record<ProjectType, number> = { eshop: 1, app: 0.7, leadgen: 0.5, content: 0.45, local: 0.5 };

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

/** Deterministic efficiency factor for a project (≈ 0.8–1.25), applied to cost
 *  independently of magnitude — so projects read as *distinct realities* (their
 *  ROAS / PNO / CPA differ), not just scaled copies of one base. Higher = more
 *  efficient (better ROAS, lower PNO). */
export function projectEfficiency(project: Project): number {
  return 0.8 + seed01(`${project.id}:eff`) * 0.45;
}
