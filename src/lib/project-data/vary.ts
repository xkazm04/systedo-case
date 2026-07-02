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
  let a = hash32(key) >>> 0;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

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

/** FNV-1a 32-bit hash (same constants as seed01) — a numeric seed for the PRNG. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
