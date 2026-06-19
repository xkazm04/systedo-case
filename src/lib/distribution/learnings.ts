/** Per-variant performance learnings — a descriptive rollup over the existing
 *  attribution sample that surfaces which channel / format / length correlated
 *  with the best click-through rate (CTR) across the project's variants. Pure,
 *  no backend: it joins the per-channel attribution with the generated variants
 *  (length + a coarse format bucket) and ranks. Seam: real per-variant analytics
 *  (UTM-tagged clicks) replacing the illustrative sample. */
import type { ChannelPerf } from "./sample";

/** Coarse content format per channel — how the article is repackaged. Drives the
 *  "best format" learning without needing a new field on the sample. */
export type VariantFormat = "Newsletter" | "Dlouhý příspěvek" | "Vizuální" | "Krátký příspěvek";

/** Length bucket of a variant's body, derived from its character count. */
export type LengthBucket = "Krátké" | "Střední" | "Dlouhé";

/** Upper bound (inclusive) of each non-final length bucket, in characters. */
export const LENGTH_BUCKET_BOUNDS = { short: 300, medium: 900 } as const;

export function lengthBucket(chars: number): LengthBucket {
  if (chars <= LENGTH_BUCKET_BOUNDS.short) return "Krátké";
  if (chars <= LENGTH_BUCKET_BOUNDS.medium) return "Střední";
  return "Dlouhé";
}

/** Channel → format bucket. Mirrors the repurpose() channels; unknown channels
 *  fall back to a short-post format so the rollup never drops a row. */
const CHANNEL_FORMAT: Record<string, VariantFormat> = {
  Newsletter: "Newsletter",
  LinkedIn: "Dlouhý příspěvek",
  Instagram: "Vizuální",
  "X / Twitter": "Krátký příspěvek",
  Facebook: "Dlouhý příspěvek",
};

export function channelFormat(channel: string): VariantFormat {
  return CHANNEL_FORMAT[channel] ?? "Krátký příspěvek";
}

/** A variant's measured row: the channel's reach/clicks plus the descriptive
 *  dimensions (format, length) we correlate CTR against. */
export interface VariantPerf {
  channel: string;
  format: VariantFormat;
  length: LengthBucket;
  chars: number;
  reach: number;
  clicks: number;
  /** clicks ÷ reach, 0 when reach is 0 (never NaN). */
  ctr: number;
}

/** Provider of a variant's body length by channel — the component passes the
 *  generated/edited variant lengths; tests can pass a fixed map. */
export type LengthByChannel = (channel: string) => number;

/** One ranked dimension value (e.g. format = "Vizuální") with its blended CTR. */
export interface DimensionLeader {
  value: string;
  /** reach-weighted CTR across the variants sharing this dimension value. */
  ctr: number;
  /** how many variants rolled into this value. */
  variants: number;
}

export interface Learnings {
  /** Per-variant rows, sorted by CTR descending (first = best). */
  rows: VariantPerf[];
  /** The single best variant by CTR (null when there are no variants). */
  bestVariant: VariantPerf | null;
  /** Best channel / format / length by reach-weighted CTR (null when empty). */
  bestChannel: DimensionLeader | null;
  bestFormat: DimensionLeader | null;
  bestLength: DimensionLeader | null;
  /** Reach-weighted mean CTR across all variants (0 when no reach). */
  overallCtr: number;
}

/** Reach-weighted CTR over a set of rows: Σclicks ÷ Σreach, 0 when no reach. */
function weightedCtr(rows: VariantPerf[]): number {
  const reach = rows.reduce((a, r) => a + r.reach, 0);
  const clicks = rows.reduce((a, r) => a + r.clicks, 0);
  return reach > 0 ? clicks / reach : 0;
}

/** Rank the distinct values of one dimension by reach-weighted CTR, descending.
 *  Stable on ties (first-seen wins) so the ordering is deterministic. */
function rankDimension(rows: VariantPerf[], key: (r: VariantPerf) => string): DimensionLeader | null {
  if (rows.length === 0) return null;
  const groups = new Map<string, VariantPerf[]>();
  for (const r of rows) {
    const v = key(r);
    const bucket = groups.get(v);
    if (bucket) bucket.push(r);
    else groups.set(v, [r]);
  }
  let best: DimensionLeader | null = null;
  for (const [value, group] of groups) {
    const ctr = weightedCtr(group);
    if (!best || ctr > best.ctr) best = { value, ctr, variants: group.length };
  }
  return best;
}

/** Roll the attribution sample up into descriptive performance learnings. Joins
 *  each channel's reach/clicks with its format + length bucket, computes CTR,
 *  sorts variants by CTR, and picks the best channel / format / length by
 *  reach-weighted CTR. Pure and deterministic. */
export function rollupLearnings(attribution: ChannelPerf[], lengthOf: LengthByChannel): Learnings {
  const rows: VariantPerf[] = attribution.map((c) => {
    const chars = Math.max(0, Math.round(lengthOf(c.channel)));
    return {
      channel: c.channel,
      format: channelFormat(c.channel),
      length: lengthBucket(chars),
      chars,
      reach: c.reach,
      clicks: c.clicks,
      ctr: c.reach > 0 ? c.clicks / c.reach : 0,
    };
  });

  // Sort by CTR desc; stable tiebreak on channel name keeps output deterministic.
  const sorted = [...rows].sort((a, b) => b.ctr - a.ctr || a.channel.localeCompare(b.channel, "cs"));

  return {
    rows: sorted,
    bestVariant: sorted[0] ?? null,
    bestChannel: rankDimension(rows, (r) => r.channel),
    bestFormat: rankDimension(rows, (r) => r.format),
    bestLength: rankDimension(rows, (r) => r.length),
    overallCtr: weightedCtr(rows),
  };
}

// --- sparkline geometry ------------------------------------------------------

export interface SparkPoint {
  x: number;
  y: number;
}

/** Map a series of CTR values to evenly-spaced points inside a `w`×`h` box,
 *  scaling y to the series max so the tallest bar/peak touches the top (with a
 *  1px top/bottom inset). A single point centres vertically. Pure geometry for
 *  the hand-rolled <svg> sparkline. */
export function ctrSparkPoints(values: number[], w: number, h: number): SparkPoint[] {
  const n = values.length;
  if (n === 0) return [];
  const max = Math.max(...values, 0);
  const inset = 1;
  const usable = Math.max(0, h - inset * 2);
  const stepX = n === 1 ? 0 : w / (n - 1);
  return values.map((v, i) => {
    const frac = max > 0 ? v / max : 0;
    const x = n === 1 ? w / 2 : i * stepX;
    const y = h - inset - frac * usable;
    return { x, y };
  });
}

/** Render an array of points as an SVG `points`/`d`-ready "x,y x,y …" string. */
export function sparkPointsAttr(points: SparkPoint[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

/** Round to 2 decimals, dropping a trailing ".00" so the attribute stays tidy. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
