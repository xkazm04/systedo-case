/** Illustrative default gross margins per channel. Price-comparison & shopping
 *  channels skew lower (discount-driven, fee-heavy); organic/direct higher (no
 *  acquisition discount). Real-integration seam: replace with COGS/margin pulled
 *  from Merchant Center / the ERP per product or category. */
import type { ChannelMargin, ProductCategory } from "./types";

export const DEFAULT_CHANNEL_MARGINS: Record<string, number> = {
  "Google Ads (Search + PMax)": 0.42,
  "Google Nákupy": 0.36,
  "Sklik (Seznam)": 0.44,
  Heureka: 0.3,
  "Zboží.cz": 0.3,
  "Meta (FB / IG)": 0.4,
  "Organic & přímá": 0.58,
};

export const FALLBACK_MARGIN = 0.45;

/** Default margins for a given set of channels (falls back for unknown names). */
export function defaultMargins(channels: { channel: string }[]): ChannelMargin[] {
  return channels.map((c) => ({
    channel: c.channel,
    marginPct: DEFAULT_CHANNEL_MARGINS[c.channel] ?? FALLBACK_MARGIN,
  }));
}

/** Illustrative product-category mix for an e-shop, with cost of goods driving a
 *  per-category margin. Same real-integration seam as the channel margins: replace
 *  with COGS pulled from Merchant Center / the ERP per category. `revenueShare`
 *  values sum to 1; the rollup re-normalises defensively. */
export const SAMPLE_PRODUCTS: ProductCategory[] = [
  { category: "Elektronika", color: "#1f8f88", revenueShare: 0.34, cogsPct: 0.82 },
  { category: "Domácnost", color: "#2dd4ce", revenueShare: 0.22, cogsPct: 0.62 },
  { category: "Móda & oblečení", color: "#fb7141", revenueShare: 0.18, cogsPct: 0.48 },
  { category: "Sport & outdoor", color: "#f59e0b", revenueShare: 0.14, cogsPct: 0.55 },
  { category: "Kosmetika & zdraví", color: "#15324b", revenueShare: 0.12, cogsPct: 0.4 },
];
