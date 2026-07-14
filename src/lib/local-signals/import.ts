/** Pure parser: a pasted/CSV rank export → a KeywordRank ladder. The realistic
 *  ingestion for A2 — map-pack rank has no clean API, so a business brings its own
 *  rank rows (from any tracker) as `keyword, oblast/area, pozice/rank`. Framework-
 *  free + unit-tested; the store/route just persist what this returns. */
import type { KeywordRank, RankPoint } from "@/lib/mappack/sample";
import type { LocalSignals } from "./types";

const DAY_MS = 86_400_000;

export interface ParsedRankRow {
  keyword: string;
  area: string;
  rank: number;
}

/** Header aliases (cs/en) → canonical column. Order-independent parsing. */
const COL: Record<string, "keyword" | "area" | "rank"> = {
  keyword: "keyword", "klíčové slovo": "keyword", "klicove slovo": "keyword", dotaz: "keyword", query: "keyword",
  area: "area", oblast: "area", lokalita: "area", město: "area", mesto: "area", district: "area", čtvrť: "area", ctvrt: "area",
  rank: "rank", pozice: "rank", position: "rank", pořadí: "rank", poradi: "rank",
};

function splitCells(line: string): string[] {
  // Accept comma, semicolon or tab separators (Sklik/GBP/Sheets exports vary).
  return line.split(/[,;\t]/).map((c) => c.trim());
}

/** Parse a rank export. Tolerant: a header row maps columns by name; without a
 *  recognisable header it assumes `keyword, area, rank`. Bad/short/duplicate rows
 *  are skipped (last write wins per keyword×area). Ranks clamp to 1..100. */
export function parseRankRows(text: string): ParsedRankRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Detect a header: a first row whose cells are all known column names.
  const firstCells = splitCells(lines[0]!).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => COL[c]);
  const hasHeader = headerCols.every(Boolean) && new Set(headerCols).size === headerCols.length;

  const idx = { keyword: 0, area: 1, rank: 2 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const byKey = new Map<string, ParsedRankRow>();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCells(line);
    const keyword = cells[idx.keyword]?.trim();
    const area = cells[idx.area]?.trim();
    const rankRaw = Number(cells[idx.rank]?.replace(/[^\d.]/g, ""));
    if (!keyword || !area || !Number.isFinite(rankRaw) || rankRaw < 1) continue;
    const rank = Math.min(100, Math.round(rankRaw));
    byKey.set(`${keyword.toLowerCase()}|${area.toLowerCase()}`, { keyword, area, rank });
  }
  return [...byKey.values()];
}

/** Turn parsed rows into the KeywordRank ladder the module renders. A single import
 *  has no history yet, so history seeds to one point stamped at the import time
 *  (`at`, ISO date) and best = current = rank. */
export function ladderFromRows(rows: ParsedRankRow[], at: string = todayISO()): KeywordRank[] {
  const day = at.slice(0, 10);
  return rows.map((r) => ({
    id: `${r.area}-${r.keyword}`.toLowerCase().replace(/\s+/g, "-"),
    keyword: r.keyword,
    area: r.area,
    history: [{ rank: r.rank, at: day }],
    current: r.rank,
    best: r.rank,
  }));
}

/** Last N points of per-keyword rank history to retain. */
const HISTORY_CAP = 12;

function todayISO(): string {
  return new Date().toISOString();
}

/** Merge a new import's rows onto the previously-persisted ladder, APPENDING each new
 *  DATE-STAMPED rank to the matching keyword×area history instead of resetting it to a
 *  single point. Without this, every import replaced history with one point, so the
 *  module's "climb / trend / best position" — its whole point — stayed flat forever on
 *  real data. `prev` is expected already-normalized (RankPoint[] history); a keyword
 *  absent from `prev` is a first-time entry, and a keyword no longer imported drops out
 *  (the import defines the current tracked set). The new point is stamped at `at`. */
export function mergeLadder(
  prev: KeywordRank[],
  rows: ParsedRankRow[],
  at: string = todayISO()
): KeywordRank[] {
  const byId = new Map(prev.map((k) => [k.id, k]));
  return ladderFromRows(rows, at).map((fresh) => {
    const existing = byId.get(fresh.id);
    if (!existing) return fresh; // first import for this keyword×area
    const history = [...existing.history, ...fresh.history].slice(-HISTORY_CAP);
    return {
      ...existing,
      keyword: fresh.keyword,
      area: fresh.area,
      history,
      current: fresh.current,
      best: Math.min(...history.map((p) => p.rank)),
    };
  });
}

/** Coerce a stored history value into the dated RankPoint[] shape. Reads BOTH shapes
 *  cleanly: the new `{rank, at}[]` passes through; a legacy bare `number[]` is dated
 *  synthetically — the newest point anchored at `anchorISO` (the import time we do
 *  know), earlier points back-dated at a fixed cadence so the ladder still renders a
 *  span. Pure; never persists — the re-serialization to the new shape happens only on
 *  the next real save (mergeLadder). */
const LEGACY_STEP_DAYS = 13;
function coerceHistory(raw: unknown, anchorISO: string): RankPoint[] {
  if (!Array.isArray(raw)) return [];
  const isNewShape = raw.every(
    (p) => p !== null && typeof p === "object" && "rank" in p && "at" in p
  );
  if (isNewShape) {
    return (raw as { rank: unknown; at: unknown }[])
      .map((p) => ({ rank: Number(p.rank), at: String(p.at) }))
      .filter((p) => Number.isFinite(p.rank));
  }
  const nums = (raw as unknown[]).filter((n): n is number => typeof n === "number");
  const parsed = Date.parse(anchorISO);
  const anchor = Number.isFinite(parsed) ? parsed : Date.now();
  const n = nums.length;
  return nums.map((rank, i) => ({
    rank,
    at: new Date(anchor - (n - 1 - i) * LEGACY_STEP_DAYS * DAY_MS).toISOString().slice(0, 10),
  }));
}

/** Normalize one persisted ladder to the canonical dated shape, recomputing
 *  current/best from the coerced history. Pure. */
export function normalizeLadder(ladder: unknown, anchorISO: string): KeywordRank[] {
  if (!Array.isArray(ladder)) return [];
  return ladder.map((k) => {
    const row = k as Partial<KeywordRank> & { history?: unknown };
    const history = coerceHistory(row.history, anchorISO);
    return {
      id: String(row.id ?? ""),
      keyword: String(row.keyword ?? ""),
      area: String(row.area ?? ""),
      history,
      current: history.length ? history[history.length - 1]!.rank : Number(row.current ?? 0),
      best: history.length ? Math.min(...history.map((p) => p.rank)) : Number(row.best ?? 0),
    };
  });
}

/** Normalize a persisted LocalSignals blob on read: dual-shape ladder history is
 *  coerced to dated RankPoint[] anchored on the ladder's own sync time. The single
 *  read choke point (the store dispatcher) calls this so every consumer — resolver,
 *  recap grounding, UI — sees one shape without any read-time rewrite to disk. */
export function normalizeSignals(signals: LocalSignals): LocalSignals {
  const anchor = signals.meta?.syncedAt ?? todayISO();
  return { ...signals, ladder: normalizeLadder(signals.ladder, anchor) };
}
