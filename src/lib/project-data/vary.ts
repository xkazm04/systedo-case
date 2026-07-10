/** Per-project variation for the seeded module fixtures. The static SAMPLE_*
 *  constants are shared demo data; these helpers derive a DETERMINISTIC per-project
 *  view of them (seeded off the project id + a module label) so two projects show
 *  genuinely different numbers instead of byte-identical fixtures — while staying
 *  honest sample data (see SampleDataNote), not a real per-account feed.
 *
 *  Design: variation is a single UNIFORM magnitude factor applied to a module's
 *  magnitude fields (counts, revenue, volumes). Because every field in a row is
 *  scaled by the same factor, ratios and orderings are preserved exactly — a
 *  funnel's `leads ≥ qualified ≥ won`, an attribution's shares summing to 100%,
 *  or a rate derived from two scaled counts all stay valid. Bounded fields
 *  (rates, ratings, percentages, dates) are simply passed through untouched; use
 *  `wobble()` only for an independent field that should vary but not scale. */
import type { Project } from "@/lib/projects/types";
import { seedScale, TYPE_BASE_FOR } from "./seed";
// Shared demo core — the same seeded PRNG (mulberry32) + FNV-1a hash the other
// demo generators use (one implementation instead of copies).
import { mulberry32, hashStr } from "@/lib/demo/prng.mjs";

export interface ProjectVary {
  /** the module's overall magnitude factor (≈ type baseline × 0.7–1.8) */
  magnitude: number;
  /** uniform-scale an integer magnitude field (counts, units, visits) */
  int(value: number): number;
  /** uniform-scale a money / continuous magnitude field, keeping `dp` decimals */
  money(value: number, dp?: number): number;
  /** small symmetric ±`jit` factor (≈1) for an INDEPENDENT field that should vary
   *  but not scale with magnitude; caller clamps if the field is bounded */
  wobble(jit?: number): number;
}

/** A stable per-project variation toolkit for one module ("label" scopes it so
 *  different modules of the same project don't move in lockstep). */
export function projectVary(project: Project, label: string): ProjectVary {
  const key = `${project.id}:${label}`;
  const magnitude = seedScale(key, TYPE_BASE_FOR(project.type));

  // Seeded PRNG for the optional independent-field wobble, consumed in call order.
  const rnd = mulberry32(hashStr(key));

  return {
    magnitude,
    int: (value) => Math.round(value * magnitude),
    money: (value, dp = 0) => {
      const f = 10 ** dp;
      return Math.round(value * magnitude * f) / f;
    },
    wobble: (jit = 0.06) => 1 + (rnd() * 2 - 1) * jit,
  };
}
