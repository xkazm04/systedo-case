/** Pure parser: a pasted/CSV rank export → a KeywordRank ladder. The realistic
 *  ingestion for A2 — map-pack rank has no clean API, so a business brings its own
 *  rank rows (from any tracker) as `keyword, oblast/area, pozice/rank`. Framework-
 *  free + unit-tested; the store/route just persist what this returns. */
import type { KeywordRank, RankPoint } from "@/lib/mappack/sample";
import type { ImportedReview, LocalSignals } from "./types";

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

// ── Reviews import (D2) ──────────────────────────────────────────────────────
// Reviews ride the same local-signals seam as ranks, but their text routinely
// contains commas/semicolons, so they need a quote-aware CSV split rather than the
// ranks parser's naive separator split. Tolerant cs/en headers; ratings clamp 1..5;
// a row without a parseable date is dropped (a review with no "when" is noise).

const REVIEW_COL: Record<string, "author" | "rating" | "text" | "at" | "area"> = {
  author: "author", autor: "author", jméno: "author", jmeno: "author", name: "author", reviewer: "author",
  rating: "rating", hodnocení: "rating", hodnoceni: "rating", stars: "rating", hvězdy: "rating", hvezdy: "rating", skóre: "rating", skore: "rating",
  text: "text", review: "text", recenze: "text", comment: "text", komentář: "text", komentar: "text", obsah: "text",
  date: "at", datum: "at", at: "at", published: "at", zveřejněno: "at", zverejneno: "at",
  area: "area", oblast: "area", lokalita: "area", město: "area", mesto: "area", pobočka: "area", pobocka: "area", location: "area",
};

/** Pick the most likely delimiter (comma / semicolon / tab) from a line. */
function detectDelimiter(line: string): string {
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t"]) {
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Split one CSV line on `delim`, honouring double-quoted fields (so review text
 *  may contain the delimiter). `""` inside a quoted field is a literal quote. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse a date cell to YYYY-MM-DD, or null when unrecognisable. Accepts ISO,
 *  Czech `D.M.YYYY` / `D/M/YYYY`, and anything Date.parse understands. */
export function parseReviewDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const mon = m[2]!.padStart(2, "0");
    if (Number(mon) < 1 || Number(mon) > 12 || Number(day) < 1 || Number(day) > 31) return null;
    return `${m[3]}-${mon}-${day}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** Parse a pasted/CSV review export → imported reviews. Tolerant: a header row maps
 *  columns by name (cs/en); without one it assumes author, rating, text, date, area.
 *  Ratings clamp to 1..5; a row with no parseable date or no content is dropped. */
export function parseReviewRows(text: string): ImportedReview[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = detectDelimiter(lines[0]!);
  const firstCells = splitCsvLine(lines[0]!, delim).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => REVIEW_COL[c]);
  const hasHeader = headerCols.some(Boolean);

  const idx = { author: 0, rating: 1, text: 2, at: 3, area: 4 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const out: ImportedReview[] = [];
  let n = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line, delim);
    const author = cells[idx.author]?.trim() ?? "";
    const ratingRaw = Number((cells[idx.rating] ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
    const reviewText = cells[idx.text]?.trim() ?? "";
    const at = parseReviewDate(cells[idx.at] ?? "");
    const area = cells[idx.area]?.trim() ?? "";
    if (!at) continue; // a review with no "when" is noise
    if (!Number.isFinite(ratingRaw) || ratingRaw < 1) continue;
    if (!reviewText && !author) continue; // need some content to be a review
    out.push({
      id: `imp-${n++}`,
      author: author || "—",
      area,
      rating: Math.min(5, Math.max(1, Math.round(ratingRaw))),
      text: reviewText,
      at,
    });
  }
  return out;
}

/** Normalize a persisted LocalSignals blob on read: dual-shape ladder history is
 *  coerced to dated RankPoint[] anchored on the ladder's own sync time. The single
 *  read choke point (the store dispatcher) calls this so every consumer — resolver,
 *  recap grounding, UI — sees one shape without any read-time rewrite to disk. */
export function normalizeSignals(signals: LocalSignals): LocalSignals {
  const anchor = signals.meta?.syncedAt ?? todayISO();
  return { ...signals, ladder: normalizeLadder(signals.ladder, anchor) };
}
