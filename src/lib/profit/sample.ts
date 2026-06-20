/** Channel gross margins now live in the shared single-source-of-truth module
 *  (`@/lib/margins`) so profit and inventory stop defining margin independently.
 *  Re-exported here for the existing profit call sites. */
import type { ChannelMargin, ProductCategory } from "./types";
import { CHANNEL_FALLBACK_MARGIN, DEFAULT_CHANNEL_MARGINS } from "@/lib/margins";

export { DEFAULT_CHANNEL_MARGINS };

/** Fallback gross margin for an unknown channel (shared definition). */
export const FALLBACK_MARGIN = CHANNEL_FALLBACK_MARGIN;

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
