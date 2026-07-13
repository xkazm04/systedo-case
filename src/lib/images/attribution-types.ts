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

/** Distil the leaderboard into a prior for the next generation: prefer the
 *  highest-ROAS style with real spend; fall back to the best vision score. */
export function deriveStylePrior(stats: StyleStat[]): StylePrior {
  const withSpend = stats.filter((s) => s.totalCost > 0);
  const best = withSpend[0] ?? stats.find((s) => s.avgVisionScore != null) ?? null;
  if (!best) return { style: null, hint: "" };

  if (best.totalCost > 0) {
    return {
      style: best.style,
      hint: `Drž se vizuálního stylu „${best.label}" — historicky nejlépe konvertuje (ROAS ${fmtMultiple(best.roas)}).`,
    };
  }
  return {
    style: best.style,
    hint: `Drž se vizuálního stylu „${best.label}" — dosud nejvyšší kvalita vizuálů.`,
  };
}
