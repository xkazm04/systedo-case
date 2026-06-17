/** Landing-page experiment evaluation: conversion rate per variant, uplift vs the
 *  control, the winner, and a two-proportion significance using the shared
 *  normalCdf. Pure. */
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
}

const cvrOf = (v: Variant) => (v.visitors > 0 ? v.signups / v.visitors : 0);

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

  return {
    id: exp.id,
    cluster: exp.cluster,
    status: exp.status,
    variants,
    winner,
    confidence,
    significant: !!winner && confidence >= 0.95,
  };
}
