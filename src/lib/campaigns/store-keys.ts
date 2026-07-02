/** Pure key + attribution helpers for the per-period campaign store. The store
 *  used to hold exactly one period at a time (every sync wiped the previous
 *  one), so flipping 7d → 30d → 7d cost three connector round-trips and three
 *  units of the daily sync quota. State is now keyed by period; these helpers
 *  centralise the doc-id scheme and the backward-compat rule for docs written
 *  before keying existed. Framework-free so the rules are unit-testable. */
import type { CampaignPeriod } from "./types";

/** Campaign doc id: period-prefixed so two periods of one campaign coexist.
 *  Legacy docs are keyed by the bare campaign id (and carry no `period` field). */
export function campaignDocId(period: CampaignPeriod, campaignId: string): string {
  return `${period}_${campaignId}`;
}

/** Portfolio-series doc id (legacy single doc was `latest`). */
export function seriesDocId(period: CampaignPeriod): string {
  return period;
}

/** Per-campaign-series doc id (legacy single doc was `campaigns`). */
export function campaignSeriesDocId(period: CampaignPeriod): string {
  return `campaigns_${period}`;
}

/**
 * Does a stored doc belong to the requested period?
 *
 * Docs written before per-period keying carry no `period` field. They are the
 * data of the tenant's *active* (root-meta) period — the single-period store
 * only ever held the last-synced period — so they match the request exactly
 * when the request targets that active period, and never leak into another
 * period's view.
 */
export function belongsToPeriod(
  docPeriod: string | null | undefined,
  activePeriod: string | null | undefined,
  requested: string
): boolean {
  return docPeriod === requested || (docPeriod == null && activePeriod === requested);
}
