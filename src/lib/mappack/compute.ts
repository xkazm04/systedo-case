/** Map-pack rollups: share-of-voice from map-pack CTR + ranking-ladder trends.
 *  Pure (only the row types), so it has a matching test-unit. */
import type { KeywordRank, MapListing } from "./sample";
import { detectWeeklyRun } from "@/lib/metrics/trends";

/** Illustrative map-pack click weights by position (1-indexed) — the top of the
 *  pack takes the lion's share, decaying fast. Used to turn ranks into a
 *  share-of-voice split. */
const RANK_WEIGHT = [1.0, 0.55, 0.32, 0.2, 0.12, 0.08, 0.05];

export interface ShareRow {
  id: string;
  name: string;
  you: boolean;
  /** fraction of estimated map-pack clicks, 0–1 (sums to 1 across the pack) */
  share: number;
}

function weight(rank: number): number {
  return RANK_WEIGHT[Math.min(rank, RANK_WEIGHT.length) - 1] ?? 0.03;
}

/** Estimated share of map-pack clicks per listing (CTR-weighted by rank),
 *  normalised to sum to 1 across the pack. Pure. */
export function shareOfVoice(listings: MapListing[]): ShareRow[] {
  const total = listings.reduce((a, l) => a + weight(l.rank), 0);
  return listings.map((l) => ({
    id: l.id,
    name: l.name,
    you: l.you,
    share: total > 0 ? weight(l.rank) / total : 0,
  }));
}

/** Listings ordered by rank (1 first). Stable copy — does not mutate input. */
export function sortByRank(listings: MapListing[]): MapListing[] {
  return [...listings].sort((a, b) => a.rank - b.rank);
}

const DAY_MS = 86_400_000;

/** Positions climbed over the tracked history (oldest − newest); positive means
 *  the rank improved (moved toward #1), negative means it slipped. Pure. */
export function ladderDelta(k: Pick<KeywordRank, "history">): number {
  const h = k.history;
  if (h.length < 2) return 0;
  return h[0]!.rank - h[h.length - 1]!.rank;
}

/** Rank change since the previous observation (prev − current); positive = improved
 *  since the last import. Null when there is only one observation. Pure. */
export function changeSinceLast(k: Pick<KeywordRank, "history">): number | null {
  const h = k.history;
  if (h.length < 2) return null;
  return h[h.length - 2]!.rank - h[h.length - 1]!.rank;
}

/** Days between the oldest and newest observation of a single keyword. 0 when the
 *  history has fewer than two dated points or the dates don't parse. Pure. */
export function observedSpanDays(k: Pick<KeywordRank, "history">): number {
  const h = k.history;
  if (h.length < 2) return 0;
  const first = Date.parse(h[0]!.at);
  const last = Date.parse(h[h.length - 1]!.at);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, Math.round((last - first) / DAY_MS));
}

/** The widest observed span across the ladder — drives the "Vývoj (N dní)" header
 *  so the label reflects the ACTUAL tracking window, not a hardcoded 90 days. Pure. */
export function ladderSpanDays(rows: Pick<KeywordRank, "history">[]): number {
  return rows.reduce((m, r) => Math.max(m, observedSpanDays(r)), 0);
}

/** Consecutive worsening imports required to call a keyword's rank in sustained
 *  decline (D3). A run of `minRun` moves spans `minRun`+1 observations. */
export const RANK_DECLINE_MIN_RUN = 3;
/** Cumulative positions the rank must lose across the run to clear the magnitude bar,
 *  so a single blip isn't mistaken for a trend. */
export const RANK_DECLINE_MIN_DROP = 3;

export interface RankDecline {
  /** consecutive worsening imports reaching the latest observation */
  run: number;
  /** positions lost from just before the run to the latest (last − base rank, >0) */
  droppedBy: number;
}

/** Sustained multi-import rank decline for one keyword (D3). REUSES the metrics
 *  engine's single decline detector, {@link detectWeeklyRun}: a rank series is
 *  irregular and integer-valued (monthly-ish imports, not the daily grid the weekly-
 *  seasonality model needs), so the *bucketing* half of detectTrends doesn't fit — but
 *  detectWeeklyRun itself is a general "run of same-direction moves beyond a noise
 *  floor, reaching the latest point" walk, which fits the ladder history exactly. We
 *  feed the raw rank series with a noise floor of 1 (ranks are integers; any move of
 *  ≥1 position is real) and z = 1. Fires only on a WORSENING run (rank number
 *  INCREASING = detectWeeklyRun's "up") of ≥ RANK_DECLINE_MIN_RUN moves whose total
 *  drop clears RANK_DECLINE_MIN_DROP positions. A recovering or flat series, or a
 *  history too short for a full run, returns null. Pure. */
export function rankDecline(k: Pick<KeywordRank, "history">): RankDecline | null {
  const ranks = k.history.map((p) => p.rank);
  if (ranks.length < RANK_DECLINE_MIN_RUN + 1) return null;
  const found = detectWeeklyRun(ranks, 1, RANK_DECLINE_MIN_RUN, 1);
  if (!found || found.direction !== "up") return null; // "up" in rank number = worse
  const droppedBy = found.last - found.base;
  if (droppedBy < RANK_DECLINE_MIN_DROP) return null;
  return { run: found.run, droppedBy };
}

/** Ladder ordered by the best current position first, then biggest climb. */
export function sortLadder(rows: KeywordRank[]): KeywordRank[] {
  return [...rows].sort((a, b) => a.current - b.current || ladderDelta(b) - ladderDelta(a));
}
