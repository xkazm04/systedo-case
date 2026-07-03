/** Demo reconciliation envelope: the budget the keyless sample campaigns must
 *  add up to so the campaign console and the case-study dashboard describe the
 *  SAME client. Both surfaces claim to be Mionelo, but the sample campaigns used
 *  to tune per-campaign volumes independently of `performance.json` — a prospect
 *  clicking from the dashboard to the console saw two contradictory versions of
 *  the client (the console's Google spend bore no relation to the dashboard's
 *  Google channel shares).
 *
 *  Pure and JSON-free by design: the caller (the server-side connector) injects
 *  the dataset, so this module — and the sample generator that consumes the
 *  envelope — stay importable from unit tests, which cannot load JSON modules
 *  through the test resolve hook. */

import type { ChannelShare, DailyPoint } from "../types";

/** Period totals the sample Google Ads portfolio should reconcile to. */
export interface DemoEnvelope {
  /** total ad spend over the period, CZK */
  cost: number;
  /** total conversion value over the period, CZK */
  value: number;
}

/** Channels that live inside the Google Ads account the campaign console
 *  models ("Google Ads (Search + PMax)", "Google Nákupy"). Sklik, Heureka,
 *  Zboží, Meta and organic are other systems and stay out of the envelope. */
const isGoogleChannel = (c: ChannelShare): boolean => c.channel.startsWith("Google");

/**
 * The dashboard's same-window Google share of cost/revenue: sum the last `days`
 * of the daily series and project the Google channels' cost/revenue shares onto
 * it. Returns null when the dataset can't produce a meaningful envelope (no
 * days, no Google channels, zero totals) — callers then keep the unscaled
 * sample profiles.
 */
export function googleDemoEnvelope(
  data: { daily: DailyPoint[]; channels: ChannelShare[] },
  days: number
): DemoEnvelope | null {
  const window = data.daily.slice(Math.max(0, data.daily.length - days));
  if (window.length === 0) return null;
  let cost = 0;
  let revenue = 0;
  for (const p of window) {
    cost += p.cost;
    revenue += p.revenue;
  }
  const google = data.channels.filter(isGoogleChannel);
  if (google.length === 0) return null;
  const costShare = google.reduce((a, c) => a + c.shares.cost, 0);
  const revenueShare = google.reduce((a, c) => a + c.shares.revenue, 0);
  const envelope = { cost: cost * costShare, value: revenue * revenueShare };
  return envelope.cost > 0 && envelope.value > 0 ? envelope : null;
}
