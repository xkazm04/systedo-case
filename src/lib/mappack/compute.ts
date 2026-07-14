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

export interface LadderTrend {
  /** positions climbed over the full tracked window (oldest − newest rank) */
  delta: number;
  /** rank change since the previous observation; null with <2 points */
  sinceLast: number | null;
  /** days between first and last observation */
  spanDays: number;
  /** improvement per 30 days over the span; null when the span is too short (<14d) */
  velocity30: number | null;
}

/** Time-anchored trend for one keyword: full-window climb, change since the last
 *  import, the observed span in days, and a ~30-day velocity where the span
 *  supports it (≥14 days). Pure. */
export function ladderTrend(k: Pick<KeywordRank, "history">): LadderTrend {
  const spanDays = observedSpanDays(k);
  const delta = ladderDelta(k);
  return {
    delta,
    sinceLast: changeSinceLast(k),
    spanDays,
    velocity30: spanDays >= 14 ? (delta / spanDays) * 30 : null,
  };
}

/** Ladder ordered by the best current position first, then biggest climb. */
export function sortLadder(rows: KeywordRank[]): KeywordRank[] {
  return [...rows].sort((a, b) => a.current - b.current || ladderDelta(b) - ladderDelta(a));
}
