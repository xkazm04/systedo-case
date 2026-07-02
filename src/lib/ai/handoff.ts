/** Cross-tool handoff mappers for the AI workspace — pure and framework-free so
 *  the seed a tool hands to its sibling is unit-testable. The workspace already
 *  chains keywords → brief and brief → article draft; these helpers close the
 *  loop into the PPC ad generator (brief → ads) without any new server surface:
 *  everything an AdRequest needs already exists on the brief side. */

import type { AdRequest, BriefResult } from "../ai-types";

/** Server-side caps for the ad-request fields (see validateAdRequest) — the seed
 *  must respect them so a handed-off form submits without edits. */
export const AD_SEED_LIMITS = { product: 200, benefits: 600, audience: 300 } as const;

/** Join list items with ", " up to `max` characters WITHOUT cutting an item in
 *  half — a truncated benefit ("doprava zda") reads worse than one fewer. Always
 *  keeps at least the first item (hard-sliced if it alone exceeds the cap). */
export function joinWithinLimit(items: string[], max: number): string {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  let out = clean[0].slice(0, max);
  for (const item of clean.slice(1)) {
    const next = `${out}, ${item}`;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** Map a finished content brief (plus the form fields that produced it) onto the
 *  PPC ad generator's request: product ← topic, audience ← audience, benefits ←
 *  the brief's outline points (the concrete selling points the model already
 *  grounded), falling back to its keywords when the outline has no points. */
export function briefToAdSeed(topic: string, audience: string, brief: BriefResult): Partial<AdRequest> {
  const points = brief.outline.flatMap((s) => s.points);
  const benefits = joinWithinLimit(
    points.length > 0 ? points : brief.keywords,
    AD_SEED_LIMITS.benefits
  );
  const product = (topic.trim() || brief.h1 || brief.titleTag).slice(0, AD_SEED_LIMITS.product);
  const seed: Partial<AdRequest> = { product };
  const aud = audience.trim().slice(0, AD_SEED_LIMITS.audience);
  if (aud) seed.audience = aud;
  if (benefits) seed.benefits = benefits;
  return seed;
}
