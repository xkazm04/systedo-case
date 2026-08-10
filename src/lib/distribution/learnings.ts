/** Per-variant performance learnings — a descriptive rollup over the existing
 *  attribution sample that surfaces which channel / format / length correlated
 *  with the best click-through rate (CTR) across the project's variants. Pure,
 *  no backend: it joins the per-channel attribution with the generated variants
 *  (length + a coarse format bucket) and ranks. Seam: real per-variant analytics
 *  (UTM-tagged clicks) replacing the illustrative sample. */
import type { SupportedLocale } from "@/lib/format";
import type { ChannelPerf } from "./sample";

/** Coarse content format per channel — how the article is repackaged. Drives the
 *  "best format" learning without needing a new field on the sample.
 *
 *  A stable KEY, not a label: these values used to be Czech display strings, which
 *  an en-locale project rendered verbatim in the Insights panel („Dlouhý
 *  příspěvek" under "Best format"). The rollup is pure data, so the language
 *  belongs at the render edge — see {@link FORMAT_LABELS}. */
export type VariantFormat = "newsletter" | "longPost" | "visual" | "shortPost";

/** Length bucket of a variant's body, derived from its character count. Key, not
 *  label — same reason as {@link VariantFormat}. */
export type LengthBucket = "short" | "medium" | "long";

/** Display labels for the two derived dimensions. Kept beside the buckets they
 *  name so a new bucket is a type error in both columns at once (the TDict
 *  contract), and exported for the panel that renders them. */
export const FORMAT_LABELS: Record<SupportedLocale, Record<VariantFormat, string>> = {
  cs: {
    newsletter: "Newsletter",
    longPost: "Dlouhý příspěvek",
    visual: "Vizuální",
    shortPost: "Krátký příspěvek",
  },
  en: {
    newsletter: "Newsletter",
    longPost: "Long post",
    visual: "Visual",
    shortPost: "Short post",
  },
};

export const LENGTH_LABELS: Record<SupportedLocale, Record<LengthBucket, string>> = {
  cs: { short: "Krátké", medium: "Střední", long: "Dlouhé" },
  en: { short: "Short", medium: "Medium", long: "Long" },
};

/** Upper bound (inclusive) of each non-final length bucket, in characters. */
export const LENGTH_BUCKET_BOUNDS = { short: 300, medium: 900 } as const;

export function lengthBucket(chars: number): LengthBucket {
  if (chars <= LENGTH_BUCKET_BOUNDS.short) return "short";
  if (chars <= LENGTH_BUCKET_BOUNDS.medium) return "medium";
  return "long";
}

/** Channel → format bucket. Mirrors the repurpose() channels; unknown channels
 *  fall back to a short-post format so the rollup never drops a row. */
const CHANNEL_FORMAT: Record<string, VariantFormat> = {
  Newsletter: "newsletter",
  LinkedIn: "longPost",
  Instagram: "visual",
  "X / Twitter": "shortPost",
  Facebook: "longPost",
};

export function channelFormat(channel: string): VariantFormat {
  return CHANNEL_FORMAT[channel] ?? "shortPost";
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

/** One ranked dimension value (e.g. format = "visual") with its blended CTR.
 *  Generic in the value type so the format/length leaders stay typed to their
 *  bucket keys and the panel's label lookup can't be handed a channel name. */
export interface DimensionLeader<V extends string = string> {
  value: V;
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
  bestFormat: DimensionLeader<VariantFormat> | null;
  bestLength: DimensionLeader<LengthBucket> | null;
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
function rankDimension<V extends string>(
  rows: VariantPerf[],
  key: (r: VariantPerf) => V
): DimensionLeader<V> | null {
  if (rows.length === 0) return null;
  const groups = new Map<V, VariantPerf[]>();
  for (const r of rows) {
    const v = key(r);
    const bucket = groups.get(v);
    if (bucket) bucket.push(r);
    else groups.set(v, [r]);
  }
  let best: DimensionLeader<V> | null = null;
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

// NOTE: the hand-rolled sparkline geometry (ctrSparkPoints / sparkPointsAttr /
// SparkPoint) that used to live here was removed — LearningsPanel renders the
// shared @/components/charts/Sparkline primitive, so nothing in production ever
// called it; only its tests did, which is false confidence, not coverage.
