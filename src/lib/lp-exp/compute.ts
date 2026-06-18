/** Landing-page experiment evaluation: conversion rate per variant, uplift vs the
 *  control, the winner, and a two-proportion significance using the shared
 *  normalCdf. Adds a sample-size "trust gate" (don't read a test before it has
 *  collected enough traffic) and a multiple-comparisons correction so multi-arm
 *  tests don't over-declare winners. Pure. */
import { normalCdf } from "@/lib/metrics";
import type { LpExperiment, Variant } from "./sample";

export interface VariantStat extends Variant {
  cvr: number;
  /** relative uplift vs control (0 for control) */
  uplift: number;
  isControl: boolean;
  isWinner: boolean;
}

export interface ExperimentResult {
  id: string;
  cluster: string;
  status: LpExperiment["status"];
  variants: VariantStat[];
  winner: VariantStat | null;
  /** two-sided confidence that winner ≠ control (0..1) */
  confidence: number;
  significant: boolean;
  /** required visitors per arm to detect the configured MDE at the corrected α */
  requiredPerArm: number;
  /** min(arm visitors) / requiredPerArm, clamped 0..1 */
  progress: number;
  /** true once every arm has reached requiredPerArm — the verdict is trustworthy */
  hasEnoughData: boolean;
  /** the per-comparison α actually used (Šidák-corrected when > 2 variants) */
  effectiveAlpha: number;
  /** number of challenger arms compared against control (drives the correction) */
  comparisons: number;
}

/** Minimum detectable effect (relative uplift) the sizing targets, and the test's
 *  family-wise error / power. Conservative defaults for a landing-page A/B read. */
export const DEFAULT_MDE = 0.15; // detect a 15 % relative lift
export const DEFAULT_ALPHA = 0.05;
export const DEFAULT_POWER = 0.8;

const cvrOf = (v: Variant) => (v.visitors > 0 ? v.signups / v.visitors : 0);

/** Inverse standard-normal CDF (quantile / probit) via the Acklam rational
 *  approximation. zFor(0.975) ≈ 1.95996. Pairs with the shared normalCdf so the
 *  sizing math reuses the same normal machinery as the significance test. */
export function zFor(p: number): number {
  if (!(p > 0 && p < 1)) return 0;
  // Coefficients in rational approximations (Peter Acklam).
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > pHigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Required visitors PER ARM for a two-proportion z-test to detect a relative
 *  `mde` lift over `baselineCvr` at significance `alpha` (two-sided) and `power`.
 *  Standard pooled-variance formula:
 *    n = (z_{1-α/2}·√(2·p̄·q̄) + z_{power}·√(p1·q1 + p2·q2))² / (p2 − p1)²
 *  with p1 = baseline, p2 = baseline·(1+mde), p̄ = (p1+p2)/2. */
export function requiredSampleSize(
  baselineCvr: number,
  mde: number = DEFAULT_MDE,
  alpha: number = DEFAULT_ALPHA,
  power: number = DEFAULT_POWER,
): number {
  const p1 = baselineCvr;
  const p2 = baselineCvr * (1 + mde);
  const delta = p2 - p1;
  if (!(p1 > 0 && p1 < 1) || !(p2 > 0 && p2 < 1) || !(delta > 0)) return Infinity;
  const zAlpha = zFor(1 - alpha / 2);
  const zBeta = zFor(power);
  const pBar = (p1 + p2) / 2;
  const pooled = zAlpha * Math.sqrt(2 * pBar * (1 - pBar));
  const unpooled = zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil((pooled + unpooled) ** 2 / delta ** 2);
}

/** Two-sided confidence that two conversion rates differ. */
function confidenceBetween(a: Variant, b: Variant): number {
  const pa = cvrOf(a);
  const pb = cvrOf(b);
  const pooled = (a.signups + b.signups) / (a.visitors + b.visitors);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.visitors + 1 / b.visitors));
  if (!(se > 0)) return 0;
  const z = Math.abs(pb - pa) / se;
  return 2 * normalCdf(z) - 1;
}

/** Šidák family-wise correction: with `comparisons` challengers vs control, the
 *  per-comparison α that holds the overall false-positive rate at `alpha`.
 *  α_perComparison = 1 − (1 − α)^(1/m). Reduces to α for a single comparison. */
export function correctedAlpha(alpha: number, comparisons: number): number {
  const m = Math.max(1, comparisons);
  return 1 - (1 - alpha) ** (1 / m);
}

export function evaluate(exp: LpExperiment): ExperimentResult {
  const control = exp.variants[0]!;
  const controlCvr = cvrOf(control);
  const winnerRaw = exp.variants.reduce((best, v) => (cvrOf(v) > cvrOf(best) ? v : best), control);

  const variants: VariantStat[] = exp.variants.map((v) => ({
    ...v,
    cvr: cvrOf(v),
    uplift: controlCvr > 0 ? (cvrOf(v) - controlCvr) / controlCvr : 0,
    isControl: v === control,
    isWinner: v === winnerRaw && winnerRaw !== control,
  }));

  const winner = variants.find((v) => v.isWinner) ?? null;
  const confidence = winner ? confidenceBetween(control, winnerRaw) : 0;

  // Multiple-comparisons correction: each challenger is compared to control, so
  // the comparison count is (variants − 1). With > 2 variants, tighten α so a
  // 3-arm test doesn't over-declare winners by chance.
  const comparisons = Math.max(1, exp.variants.length - 1);
  const effectiveAlpha = correctedAlpha(DEFAULT_ALPHA, comparisons);

  // Sample-size trust gate: size for the corrected α against the control CVR.
  const requiredPerArm = requiredSampleSize(controlCvr, DEFAULT_MDE, effectiveAlpha, DEFAULT_POWER);
  const minVisitors = Math.min(...exp.variants.map((v) => v.visitors));
  const progress = Number.isFinite(requiredPerArm) && requiredPerArm > 0
    ? Math.max(0, Math.min(1, minVisitors / requiredPerArm))
    : 1;
  const hasEnoughData = Number.isFinite(requiredPerArm) ? minVisitors >= requiredPerArm : true;

  // A `done` experiment is read as before (the test was stopped deliberately).
  // A `running` experiment must clear BOTH the corrected confidence threshold AND
  // the sample-size gate before we declare significance — this is the peeking guard.
  const meetsConfidence = !!winner && confidence >= 1 - effectiveAlpha;
  const significant = exp.status === "done"
    ? !!winner && confidence >= 1 - effectiveAlpha
    : meetsConfidence && hasEnoughData;

  return {
    id: exp.id,
    cluster: exp.cluster,
    status: exp.status,
    variants,
    winner,
    confidence,
    significant,
    requiredPerArm,
    progress,
    hasEnoughData,
    effectiveAlpha,
    comparisons,
  };
}
