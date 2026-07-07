/** Map-pack rollups: share-of-voice from map-pack CTR + ranking-ladder trends.
 *  Pure (only the row types), so it has a matching test-unit. */
import type { KeywordRank, MapListing } from "./sample";

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

/** Positions climbed over the tracked history (oldest − newest); positive means
 *  the rank improved (moved toward #1), negative means it slipped. Pure. */
export function ladderDelta(k: Pick<KeywordRank, "history">): number {
  const h = k.history;
  if (h.length < 2) return 0;
  return h[0] - h[h.length - 1];
}

/** Ladder ordered by the best current position first, then biggest climb. */
export function sortLadder(rows: KeywordRank[]): KeywordRank[] {
  return [...rows].sort((a, b) => a.current - b.current || ladderDelta(b) - ladderDelta(a));
}
