/** A/B ad experiments — pure model + scoring (no React, no I/O), so both the
 *  client comparison UI and the server store import it without pulling
 *  firebase-admin into the bundle. A variant is one generated ad set; an
 *  experiment pits 2+ against each other and declares a winner by real
 *  performance when metrics exist, otherwise by predicted ad strength. */
import type { AdResult } from "@/lib/ai-types";
import { ctr, cr, cpa, roas } from "@/lib/metrics/ratios";

/** Real (or entered) performance for one variant over the test window. */
export interface AdVariantMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  /** media spend, CZK */
  cost: number;
  /** value of conversions, CZK */
  convValue: number;
}

export interface AdVariant {
  id: string;
  label: string;
  ad: AdResult;
  /** predicted ad strength 0–100 at save time (computeAdStrength) */
  strength: number;
  /** real performance once known; null until measured */
  metrics: AdVariantMetrics | null;
}

export interface Experiment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  variants: AdVariant[];
  /** id of the current winner (null until ≥1 variant) */
  winnerVariantId: string | null;
}

/** Click-through rate (clicks / impressions). */
export function variantCtr(m: AdVariantMetrics): number {
  return ctr(m.clicks, m.impressions);
}

/** Conversion rate (conversions / clicks). */
export function variantCr(m: AdVariantMetrics): number {
  return cr(m.conversions, m.clicks);
}

/** Cost per acquisition (cost / conversions), CZK. */
export function variantCpa(m: AdVariantMetrics): number {
  return cpa(m.cost, m.conversions);
}

/** Return on ad spend (convValue / cost). */
export function variantRoas(m: AdVariantMetrics): number {
  return roas(m.convValue, m.cost);
}

/** Whether a winner can be decided on real performance: every variant has spend.
 *  Below this bar (or with a single variant), the predicted strength decides. */
export function hasPerformanceBasis(exp: Experiment): boolean {
  return (
    exp.variants.length >= 2 &&
    exp.variants.every((v) => v.metrics != null && v.metrics.cost > 0)
  );
}

/** The winning variant's id: highest ROAS when every variant has spend, else the
 *  highest predicted ad strength. Null for an empty experiment. */
export function pickWinner(exp: Experiment): string | null {
  if (exp.variants.length === 0) return null;
  const byPerformance = hasPerformanceBasis(exp);
  const score = (v: AdVariant): number =>
    byPerformance && v.metrics ? variantRoas(v.metrics) : v.strength;
  return exp.variants.reduce((best, v) => (score(v) > score(best) ? v : best)).id;
}
