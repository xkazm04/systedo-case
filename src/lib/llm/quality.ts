/** Quality scoring for the LLM model-comparison matrix. Turns the raw judge
 *  dimensions (measured by `npm run llm:quality`, see docs/testing/) into a single
 *  composite score, per-model overalls, and per-operation recommendations — the
 *  numbers the BYOM settings surface so users can pick a provider/model on
 *  evidence. Pure + client-safe (no data, no I/O — the measured data lives in
 *  ./quality-scores). */
import type { ByomVendor } from "./keys/types";
import type { SupportedLocale } from "@/lib/format";

export interface QualityDims {
  relevance: number;
  correctness: number;
  adherence: number;
  tone: number;
}

/** One measured (operation × model) result. When `judges` > 1 the dimensions are
 *  the median of that many Sonnet judges; when `judges` === 1 it is a single
 *  Sonnet verdict (a quota-limited pass). Read `judges` — never assume a median. */
export interface QualityCell extends QualityDims {
  /** the judge's own overall 1–10 (kept for reference; the composite is derived) */
  score: number;
  /** did the output pass the tool's own schema validator */
  valid: boolean;
  /** how many Sonnet judges backed this cell (median when > 1; 1 = single-judge) */
  judges: number;
  /** provider-reported USD cost of this one generation (OpenRouter usage.cost) */
  costUsd?: number;
}

export interface QualityScores {
  /** ISO timestamp of the run this was baked from */
  measuredAt: string;
  /** the judge label — "claude-sonnet", or "claude-sonnet (medián ze N)" ONLY when
   *  the baked run truly realised ≥2 judges per cell (see bake-quality-scores.mjs).
   *  The label always matches the real judge count — never claims a median it lacks. */
  judge: string;
  /** measured model slugs (matrix targets), in display order */
  models: string[];
  /** cells[operationId][modelSlug] — only measured cells present */
  cells: Record<string, Record<string, QualityCell>>;
}

/** Dimension weights — correctness + task-adherence dominate for these grounded
 *  marketing tools (a fluent but invented answer is worse than an honest gap);
 *  relevance and tone matter but less. Sum = 1. Tune here to re-weight the whole
 *  scorecard without re-running the matrix. */
export const QUALITY_WEIGHTS: QualityDims = {
  correctness: 0.35,
  adherence: 0.3,
  relevance: 0.2,
  tone: 0.15,
};

/** A schema-invalid output is clamped/dropped in production, so it takes a real
 *  quality hit even when the prose reads well. */
const INVALID_FACTOR = 0.7;

const clamp10 = (n: number) => Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;

/** Composite quality 0–10 from a cell's dimensions (+ a validity penalty). */
export function qualityComposite(c: QualityCell): number {
  const raw =
    QUALITY_WEIGHTS.correctness * c.correctness +
    QUALITY_WEIGHTS.adherence * c.adherence +
    QUALITY_WEIGHTS.relevance * c.relevance +
    QUALITY_WEIGHTS.tone * c.tone;
  return clamp10(c.valid ? raw : raw * INVALID_FACTOR);
}

/** The composite for one (operation, model slug), or null when not measured. */
export function cellComposite(scores: QualityScores, op: string, modelSlug: string): number | null {
  const c = scores.cells[op]?.[modelSlug];
  return c ? qualityComposite(c) : null;
}

/** The best (highest-composite) model for one operation. */
export function bestModelForOp(scores: QualityScores, op: string): { model: string; composite: number } | null {
  let best: { model: string; composite: number } | null = null;
  for (const model of scores.models) {
    const c = cellComposite(scores, op, model);
    if (c !== null && (!best || c > best.composite)) best = { model, composite: c };
  }
  return best;
}

export interface ModelOverall {
  model: string;
  /** mean composite across measured operations (null when none) */
  overall: number | null;
  /** measured operations / total operations in the score set (0–1) */
  coverage: number;
  measured: number;
  total: number;
  /** operations where this model is the top scorer */
  wins: number;
  /** mean provider-reported cost per operation (null when unmeasured) */
  avgCostUsd: number | null;
}

/** Per-model overall = mean composite across its measured operations, plus how
 *  many operations it covered, how many it won outright, and its mean cost/op. */
export function modelOverall(scores: QualityScores, model: string): ModelOverall {
  const ops = Object.keys(scores.cells);
  const comps = ops
    .map((op) => cellComposite(scores, op, model))
    .filter((v): v is number => v !== null);
  const overall = comps.length ? clamp10(comps.reduce((s, v) => s + v, 0) / comps.length) : null;
  const wins = ops.filter((op) => bestModelForOp(scores, op)?.model === model).length;
  const costs = ops
    .map((op) => scores.cells[op]?.[model]?.costUsd)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const avgCostUsd = costs.length ? costs.reduce((s, v) => s + v, 0) / costs.length : null;
  return {
    model,
    overall,
    coverage: ops.length ? comps.length / ops.length : 0,
    measured: comps.length,
    total: ops.length,
    wins,
    avgCostUsd,
  };
}

/** Format a USD cost for display — sub-cent values keep enough precision to stay
 *  non-zero; null/0 renders as an em dash. */
export function formatCostUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || n === 0) return "—";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(3)}`;
}

/** Models ranked by overall composite (unmeasured last). */
export function modelRanking(scores: QualityScores): ModelOverall[] {
  return scores.models
    .map((m) => modelOverall(scores, m))
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}

/** Map a BYOM catalog (vendor, model) to the OpenRouter slug the matrix measured.
 *  The matrix runs everything via OpenRouter, so a direct-vendor catalog model
 *  (openai → gpt-5.4-mini) maps to its provider-prefixed slug (openai/gpt-5.4-mini);
 *  openrouter models are already slugs. */
const VENDOR_PREFIX: Partial<Record<ByomVendor, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "google",
};
export function matrixSlug(vendor: ByomVendor, model: string): string {
  return vendor === "openrouter" ? model : `${VENDOR_PREFIX[vendor] ?? vendor}/${model}`;
}

// ── measurement freshness ─────────────────────────────────────────────────────
// The scorecard is a STATIC bake — nothing re-measures it. Surface its age so a
// months-old number isn't read as current. These are pure so they unit-test cleanly.

/** Days beyond which a baked measurement is surfaced as stale in the UI. */
export const STALENESS_THRESHOLD_DAYS = 30;

/** Whole days between a measurement's ISO timestamp and `now` (≥ 0; NaN if the
 *  timestamp can't be parsed). */
export function measurementAgeDays(measuredAt: string, now: Date = new Date()): number {
  const t = Date.parse(measuredAt);
  if (!Number.isFinite(t)) return NaN;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Is a baked measurement older than the staleness threshold? */
export function isMeasurementStale(
  measuredAt: string,
  now: Date = new Date(),
  thresholdDays: number = STALENESS_THRESHOLD_DAYS
): boolean {
  const d = measurementAgeDays(measuredAt, now);
  return Number.isFinite(d) && d >= thresholdDays;
}

/** Locale-aware "před N dny / N days ago" phrase for a measurement's age (cs/en).
 *  Buckets to keep the number small: < 14 d → days, < 60 d → weeks, else months.
 *  Returns "" for an unparseable timestamp so the caller can omit the note. */
export function formatMeasuredAge(
  measuredAt: string,
  locale: SupportedLocale,
  now: Date = new Date()
): string {
  const days = measurementAgeDays(measuredAt, now);
  if (!Number.isFinite(days)) return "";
  const cs = locale === "cs";
  if (days < 1) return cs ? "dnes" : "today";

  let n: number;
  let unit: "day" | "week" | "month";
  if (days < 14) {
    n = days;
    unit = "day";
  } else if (days < 60) {
    n = Math.round(days / 7);
    unit = "week";
  } else {
    n = Math.round(days / 30);
    unit = "month";
  }

  if (cs) {
    // Czech instrumental after "před": den→dnem(1)/dny, týden→týdnem(1)/týdny,
    // měsíc→měsícem(1)/měsíci.
    const w =
      unit === "day"
        ? n === 1
          ? "dnem"
          : "dny"
        : unit === "week"
          ? n === 1
            ? "týdnem"
            : "týdny"
          : n === 1
            ? "měsícem"
            : "měsíci";
    return `před ${n} ${w}`;
  }
  const w = unit === "day" ? "day" : unit === "week" ? "week" : "month";
  return `${n} ${w}${n === 1 ? "" : "s"} ago`;
}

// ── self-judging conflict ─────────────────────────────────────────────────────
// The judge is Claude (Sonnet), so any Anthropic-family model grades its own
// vendor's outputs — a home-team bias to flag, not hide (see docs step 5).

/** The vendor family whose own outputs the judge grades. Derived from the baked
 *  judge label; null when the judge isn't a recognised family. */
export function judgeVendor(judge: string): ByomVendor | null {
  return /claude|sonnet|anthropic/i.test(judge) ? "anthropic" : null;
}

/** True when a measured model slug belongs to the judge's own vendor family — its
 *  cells are self-judged (home-team bias) and shouldn't be read as neutral. */
export function isSelfJudged(judge: string, modelSlug: string): boolean {
  if (!judgeVendor(judge)) return false;
  const prefix = modelSlug.includes("/") ? modelSlug.split("/")[0]!.toLowerCase() : "";
  return prefix === "anthropic" || /claude|sonnet|anthropic/i.test(modelSlug);
}
