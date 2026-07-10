/** Pure parser: a pasted/CSV rank export → a KeywordRank ladder. The realistic
 *  ingestion for A2 — map-pack rank has no clean API, so a business brings its own
 *  rank rows (from any tracker) as `keyword, oblast/area, pozice/rank`. Framework-
 *  free + unit-tested; the store/route just persist what this returns. */
import type { KeywordRank } from "@/lib/mappack/sample";

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
 *  has no history yet, so history seeds to [rank] and best = current = rank. */
export function ladderFromRows(rows: ParsedRankRow[]): KeywordRank[] {
  return rows.map((r) => ({
    id: `${r.area}-${r.keyword}`.toLowerCase().replace(/\s+/g, "-"),
    keyword: r.keyword,
    area: r.area,
    history: [r.rank],
    current: r.rank,
    best: r.rank,
  }));
}

/** Last N points of per-keyword rank history to retain. */
const HISTORY_CAP = 12;

/** Merge a new import's rows onto the previously-persisted ladder, APPENDING each new
 *  rank to the matching keyword×area history instead of resetting it to a single point.
 *  Without this, every import replaced history with `[rank]`, so the module's "climb /
 *  trend / best position" — its whole point — stayed flat forever on real data. A
 *  keyword absent from `prev` is a first-time entry (seeded by ladderFromRows); the
 *  import defines the current tracked set, so a keyword no longer imported drops out. */
export function mergeLadder(prev: KeywordRank[], rows: ParsedRankRow[]): KeywordRank[] {
  const byId = new Map(prev.map((k) => [k.id, k]));
  return ladderFromRows(rows).map((fresh) => {
    const existing = byId.get(fresh.id);
    if (!existing) return fresh; // first import for this keyword×area
    const history = [...existing.history, fresh.current].slice(-HISTORY_CAP);
    return {
      ...existing,
      keyword: fresh.keyword,
      area: fresh.area,
      history,
      current: fresh.current,
      best: Math.min(...history),
    };
  });
}
