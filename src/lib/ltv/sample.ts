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

/** Illustrative acquisition cohorts for an E-SHOP project. Same shape, e-commerce
 *  semantics: `signups` = first-time customers, `spend` = the ad spend that won them,
 *  `arpu` = average order value (the per-active-customer monthly revenue), and
 *  `retention` = the REPEAT-PURCHASE curve (fraction still ordering in month M) —
 *  far lower + flatter than SaaS retention, as e-commerce repeat behaviour is. The
 *  CAC / LTV / payback math is identical; only the shape of the inputs differs.
 *  Real-integration seam: e-shop orders + customers (Shoptet / Shopify / GA4). */
export const ESHOP_COHORTS: Cohort[] = [
  {
    month: "Led 2026",
    signups: 612,
    spend: 211_140, // CAC ~345
    arpu: 880, // AOV
    retention: [1, 0.27, 0.19, 0.15, 0.12, 0.1],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 116_000, signups: 318 },
      { channel: "Sklik (Seznam)", spend: 45_140, signups: 134 },
      { channel: "Meta (FB / IG)", spend: 50_000, signups: 102 },
      { channel: "Organic & přímá", spend: 0, signups: 58 },
    ],
  },
  {
    month: "Úno 2026",
    signups: 668,
    spend: 233_800, // CAC ~350
    arpu: 885,
    retention: [1, 0.28, 0.2, 0.16, 0.13, 0.11],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 128_000, signups: 350 },
      { channel: "Sklik (Seznam)", spend: 50_800, signups: 150 },
      { channel: "Meta (FB / IG)", spend: 55_000, signups: 110 },
      { channel: "Organic & přímá", spend: 0, signups: 58 },
    ],
  },
  {
    month: "Bře 2026",
    signups: 742,
    spend: 252_280, // CAC ~340
    arpu: 905,
    retention: [1, 0.3, 0.22, 0.17, 0.14, 0.12],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 138_000, signups: 392 },
      { channel: "Sklik (Seznam)", spend: 56_280, signups: 168 },
      { channel: "Meta (FB / IG)", spend: 58_000, signups: 118 },
      { channel: "Organic & přímá", spend: 0, signups: 64 },
    ],
  },
  {
    month: "Dub 2026",
    signups: 690,
    spend: 248_400, // CAC ~360
    arpu: 870,
    retention: [1, 0.25, 0.18, 0.14, 0.11, 0.09],
    channels: [
      { channel: "Google Ads (Search + PMax)", spend: 140_000, signups: 360 },
      { channel: "Sklik (Seznam)", spend: 52_400, signups: 150 },
      { channel: "Meta (FB / IG)", spend: 56_000, signups: 116 },
      { channel: "Organic & přímá", spend: 0, signups: 64 },
    ],
  },
  // No channel breakdown for the last two cohorts → blended-only fallback path.
  { month: "Kvě 2026", signups: 805, spend: 282_555, arpu: 915, retention: [1, 0.31, 0.23, 0.18, 0.15] },
  { month: "Čvn 2026", signups: 768, spend: 276_480, arpu: 900, retention: [1, 0.29, 0.21, 0.16] },
];
