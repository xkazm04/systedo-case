/** Creative-to-revenue attribution — pure model + scoring (no React, no I/O), so
 *  the client panel and the server store share it without firebase-admin in the
 *  bundle. Joins a generated creative's Gemini-vision score to its real ad
 *  performance, then ranks visual styles by what actually earns — and distils a
 *  "style prior" that biases the next generation toward winners. */
import type { ImageStyle } from "./types";
import { IMAGE_STYLE_LABELS } from "./types";
import { fmtMultiple } from "@/lib/format";
import { roas } from "@/lib/metrics/ratios";

/** Real (or entered) performance for one creative over its run. */
export interface CreativeMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  /** media spend, CZK */
  cost: number;
  /** value of conversions, CZK */
  convValue: number;
}

const METRIC_FIELDS = ["impressions", "clicks", "conversions", "cost", "convValue"] as const;

/** Locale-tolerant single-field parse. Absent (undefined/null/"") → 0; a value
 *  that still can't be read as a number → null (invalid, not a silent zero).
 *  This is a Czech product, so accept "1,5" (decimal comma) and "1 000"
 *  (thousands space / NBSP) before parsing. */
export function parseMetricField(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return 0;
  const cleaned = typeof v === "string" ? v.replace(/\s/g, "").replace(",", ".") : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

/** Parse a metrics payload with locale tolerance. Returns the field name of the
 *  first value that was provided but unparseable (so the route can 422 with it),
 *  or the coerced metrics. A non-object input is `null` (no metrics at all). */
export function parseMetrics(
  raw: unknown
): { metrics: CreativeMetrics } | { invalidField: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const out = {} as CreativeMetrics;
  for (const f of METRIC_FIELDS) {
    const n = parseMetricField(m[f]);
    if (n === null) return { invalidField: f };
    out[f] = n;
  }
  return { metrics: out };
}

/** A creative tied to a campaign + its measured performance. */
export interface CreativeLink {
  id: string;
  /** library id of the persisted creative, when known */
  creativeId: string | null;
  style: ImageStyle;
  format: string;
  prompt: string;
  /** Gemini-vision quality 1–10 at generation (null if unscored) */
  visionScore: number | null;
  campaignId: string | null;
  campaignName: string | null;
  metrics: CreativeMetrics | null;
  createdAt: string;
}

/** Aggregated performance for one visual style. */
export interface StyleStat {
  style: ImageStyle;
  label: string;
  count: number;
  /** mean Gemini-vision score across creatives that had one */
  avgVisionScore: number | null;
  /** portfolio ROAS for the style (Σvalue / Σcost), 0 when no spend */
  roas: number;
  totalCost: number;
  totalConvValue: number;
  conversions: number;
}

/** Per-style leaderboard, ranked by ROAS (then by vision score), so "which look
 *  earns" is answerable at a glance. Only links with metrics feed the money math;
 *  vision averages use every creative. */
export function styleLeaderboard(links: CreativeLink[]): StyleStat[] {
  const byStyle = new Map<ImageStyle, CreativeLink[]>();
  for (const l of links) {
    const arr = byStyle.get(l.style);
    if (arr) arr.push(l);
    else byStyle.set(l.style, [l]);
  }

  const stats: StyleStat[] = [];
  for (const [style, group] of byStyle) {
    const scored = group.filter((l) => l.visionScore != null);
    const avgVisionScore =
      scored.length > 0 ? scored.reduce((s, l) => s + (l.visionScore ?? 0), 0) / scored.length : null;
    const withM = group.filter((l) => l.metrics != null);
    const totalCost = withM.reduce((s, l) => s + (l.metrics?.cost ?? 0), 0);
    const totalConvValue = withM.reduce((s, l) => s + (l.metrics?.convValue ?? 0), 0);
    const conversions = withM.reduce((s, l) => s + (l.metrics?.conversions ?? 0), 0);
    stats.push({
      style,
      label: IMAGE_STYLE_LABELS[style],
      count: group.length,
      avgVisionScore,
      roas: roas(totalConvValue, totalCost),
      totalCost,
      totalConvValue,
      conversions,
    });
  }

  return stats.sort((a, b) => b.roas - a.roas || (b.avgVisionScore ?? 0) - (a.avgVisionScore ?? 0));
}

export interface StylePrior {
  style: ImageStyle | null;
  /** Czech hint prepended to the next generation prompt (empty when no signal). */
  hint: string;
}

/** A style must actually convert before we crown it a "best converting" prior:
 *  spend alone (with ROAS 0) proves the opposite, so require positive ROAS and
 *  at least one real conversion. */
const PRIOR_MIN_CONVERSIONS = 1;

/** Distil the leaderboard into a prior for the next generation: prefer the
 *  highest-ROAS style that actually earned (positive ROAS + a real conversion);
 *  otherwise fall back to the best average vision score. */
export function deriveStylePrior(stats: StyleStat[]): StylePrior {
  // stats arrives sorted by ROAS desc, so the first profitable entry is the top
  // earner; still filter explicitly rather than trust the upstream sort.
  const profitable = stats.filter(
    (s) => s.totalCost > 0 && s.roas > 0 && s.conversions >= PRIOR_MIN_CONVERSIONS,
  );
  if (profitable[0]) {
    const best = profitable[0];
    return {
      style: best.style,
      hint: `Drž se vizuálního stylu „${best.label}" — historicky nejlépe konvertuje (ROAS ${fmtMultiple(best.roas)}).`,
    };
  }

  const bestVision = stats
    .filter((s) => s.avgVisionScore != null)
    .sort((a, b) => (b.avgVisionScore ?? 0) - (a.avgVisionScore ?? 0))[0];
  if (bestVision) {
    return {
      style: bestVision.style,
      hint: `Drž se vizuálního stylu „${bestVision.label}" — dosud nejvyšší kvalita vizuálů.`,
    };
  }
  return { style: null, hint: "" };
}
