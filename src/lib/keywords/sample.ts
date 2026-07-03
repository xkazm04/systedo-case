/** Deterministic sample keyword ideas for the Keyword Planner's keyless mode —
 *  same philosophy as sample campaigns: a seeded PRNG makes output reproducible
 *  for a given seed term, with believable volume/competition/CPC spreads so the
 *  opportunity ranking and intent grouping tell a real story out of the box. */
import type { Competition, RawKeywordIdea } from "./types";
// Shared demo core — the same seeded PRNG + hash as the campaign sample and the
// dashboard seed script (one implementation instead of three copies).
import { mulberry32, hashStr } from "@/lib/demo/prng.mjs";

/** Modifier templates with a rough volume weight + competition lean, so the mix
 *  spans informational (easy, mid-volume) to transactional (hard, lower-volume). */
const MODIFIERS: { make: (s: string) => string; volume: number; comp: number }[] = [
  { make: (s) => s, volume: 1.0, comp: 0.7 },
  { make: (s) => `${s} cena`, volume: 0.55, comp: 0.85 },
  { make: (s) => `${s} koupit`, volume: 0.4, comp: 0.9 },
  { make: (s) => `nejlepší ${s}`, volume: 0.5, comp: 0.55 },
  { make: (s) => `${s} recenze`, volume: 0.35, comp: 0.45 },
  { make: (s) => `jak vybrat ${s}`, volume: 0.45, comp: 0.3 },
  { make: (s) => `${s} druhy`, volume: 0.3, comp: 0.25 },
  { make: (s) => `${s} levně`, volume: 0.25, comp: 0.8 },
  { make: (s) => `${s} eshop`, volume: 0.3, comp: 0.88 },
  { make: (s) => `${s} srovnání`, volume: 0.28, comp: 0.4 },
  { make: (s) => `zdravé ${s}`, volume: 0.42, comp: 0.5 },
  { make: (s) => `${s} skladem`, volume: 0.2, comp: 0.82 },
  { make: (s) => `${s} návod`, volume: 0.33, comp: 0.22 },
  { make: (s) => `${s} pro děti`, volume: 0.26, comp: 0.6 },
  { make: (s) => `bio ${s}`, volume: 0.31, comp: 0.65 },
  { make: (s) => `${s} účinky`, volume: 0.29, comp: 0.35 },
];

function competitionBand(index: number): Competition {
  return index >= 66 ? "high" : index >= 33 ? "medium" : "low";
}

/** Deterministic keyword ideas for a seed term. */
export function sampleKeywordIdeas(seed: string): RawKeywordIdea[] {
  const term = seed.trim().toLowerCase() || "ořechy";
  const rnd = mulberry32(hashStr(`kw:${term}`));
  const j = (scale = 0.25) => 1 + (rnd() * 2 - 1) * scale;

  // A head-term base volume that scales with seed length (shorter = broader).
  const base = Math.round(9000 / Math.max(1, Math.sqrt(term.length)));

  return MODIFIERS.map((m) => {
    const avgMonthlySearches = Math.max(20, Math.round(base * m.volume * j()));
    const competitionIndex = Math.min(100, Math.max(1, Math.round(m.comp * 100 * j(0.15))));
    const lowBidCzk = Math.max(1, Math.round((2 + competitionIndex / 12) * j()));
    const highBidCzk = Math.round(lowBidCzk * (1.8 + rnd() * 1.2));
    return {
      keyword: m.make(term),
      avgMonthlySearches,
      competition: competitionBand(competitionIndex),
      competitionIndex,
      lowBidCzk,
      highBidCzk,
    };
  });
}
