/** Illustrative default gross margins per channel. Price-comparison & shopping
 *  channels skew lower (discount-driven, fee-heavy); organic/direct higher (no
 *  acquisition discount). Real-integration seam: replace with COGS/margin pulled
 *  from Merchant Center / the ERP per product or category. */
import type { ChannelMargin } from "./types";

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
