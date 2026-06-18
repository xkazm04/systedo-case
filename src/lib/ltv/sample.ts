/** Illustrative acquisition cohorts for a SaaS/app project. Each cohort is a
 *  month of paid signups with the ad spend that won them, an ARPU, and a monthly
 *  retention curve. Real-integration seam: product-analytics events
 *  (Segment / PostHog / Stripe). */

/** A single acquisition channel's contribution to a cohort. Per-cohort sums of
 *  `spend`/`signups` across channels equal the cohort's blended totals. */
export interface CohortChannel {
  /** channel name, matching the metrics channel conventions */
  channel: string;
  /** ad spend on this channel (CZK); 0 for organic/direct */
  spend: number;
  /** signups attributed to this channel */
  signups: number;
}

export interface Cohort {
  /** cohort month label, e.g. "Led 2026" */
  month: string;
  /** paid signups in the cohort */
  signups: number;
  /** ad spend that acquired them (CZK) */
  spend: number;
  /** average revenue per active user per month (CZK) */
  arpu: number;
  /** fraction still active in month M0, M1, … */
  retention: number[];
  /** optional acquisition-channel breakdown; sums back to blended `spend`/`signups` */
  channels?: CohortChannel[];
}

/** Channel display colors, mirroring the metrics channel palette (src/data/
 *  performance.json) so the LTV channel dots match the rest of the app. */
export const LTV_CHANNEL_COLORS: Record<string, string> = {
  "Google Ads (Search + PMax)": "#1f8f88",
  "Sklik (Seznam)": "#15324b",
  "Meta (FB / IG)": "#fb7141",
  "Organic & přímá": "#0b1b2b",
};

export const FALLBACK_CHANNEL_COLOR = "#94a3b8";

/** Channels that are free acquisition — excluded from the paid-only CAC. */
const ORGANIC_CHANNELS = new Set(["Organic & přímá"]);

/** Whether a channel is paid (costs ad money). Organic/direct/SEO are free. */
export function isPaidChannel(channel: string): boolean {
  return !ORGANIC_CHANNELS.has(channel);
}

export const SAMPLE_COHORTS: Cohort[] = [
  {
    month: "Led 2026",
    signups: 210,
    spend: 178_500,
    arpu: 290,
    retention: [1, 0.72, 0.61, 0.54, 0.5, 0.47],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 102_000, signups: 96 },
      { channel: "Sklik (Seznam)", spend: 44_500, signups: 48 },
      { channel: "Meta (FB / IG)", spend: 32_000, signups: 38 },
      { channel: "Organic & přímá", spend: 0, signups: 28 },
    ],
  },
  {
    month: "Úno 2026",
    signups: 245,
    spend: 210_700,
    arpu: 295,
    retention: [1, 0.7, 0.59, 0.52, 0.48, 0.45],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 121_000, signups: 110 },
      { channel: "Sklik (Seznam)", spend: 50_200, signups: 54 },
      { channel: "Meta (FB / IG)", spend: 39_500, signups: 46 },
      { channel: "Organic & přímá", spend: 0, signups: 35 },
    ],
  },
  {
    month: "Bře 2026",
    signups: 288,
    spend: 233_280,
    arpu: 300,
    retention: [1, 0.74, 0.63, 0.56, 0.52, 0.49],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 130_280, signups: 128 },
      { channel: "Sklik (Seznam)", spend: 58_000, signups: 66 },
      { channel: "Meta (FB / IG)", spend: 45_000, signups: 52 },
      { channel: "Organic & přímá", spend: 0, signups: 42 },
    ],
  },
  {
    month: "Dub 2026",
    signups: 263,
    spend: 252_480,
    arpu: 298,
    retention: [1, 0.68, 0.56, 0.5, 0.46, 0.43],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 142_480, signups: 116 },
      { channel: "Sklik (Seznam)", spend: 60_000, signups: 58 },
      { channel: "Meta (FB / IG)", spend: 50_000, signups: 50 },
      { channel: "Organic & přímá", spend: 0, signups: 39 },
    ],
  },
  // No channel breakdown for the last two cohorts → blended-only fallback path.
  { month: "Kvě 2026", signups: 312, spend: 274_560, arpu: 305, retention: [1, 0.75, 0.64, 0.58, 0.54] },
  { month: "Čvn 2026", signups: 298, spend: 295_020, arpu: 302, retention: [1, 0.71, 0.6, 0.53] },
];
