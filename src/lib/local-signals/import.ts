/** Pure parser: a pasted/CSV rank export → a KeywordRank ladder. The realistic
 *  ingestion for A2 — map-pack rank has no clean API, so a business brings its own
 *  rank rows (from any tracker) as `keyword, oblast/area, pozice/rank`. Framework-
 *  free + unit-tested; the store/route just persist what this returns. */
import type { KeywordRank, RankPoint } from "@/lib/mappack/sample";
import type { ImportedGbpRow, ImportedReview, LocalSignals } from "./types";

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

/** The canonical identity of a keyword×area row — case/whitespace-normalized and
 *  joined with a pipe (a delimiter that cannot appear in the collapsed slug the old
 *  id used). This is BOTH the dedup key and the persisted `id`, so two visually-close
 *  areas like „Praha 4" and „Praha-4" no longer collapse to the same slug id and get
 *  merged into one keyword's history (D2 slug-collision fix). Legacy slug ids (`area-
 *  keyword`) still READ fine — the merge matches on this pair derived from the row's
 *  keyword/area fields, never on the stored id string, so old blobs re-key cleanly. */
export function ladderKey(keyword: string, area: string): string {
  return `${keyword.trim().toLowerCase()}|${area.trim().toLowerCase()}`;
}

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
    byKey.set(ladderKey(keyword, area), { keyword, area, rank });
  }
  return [...byKey.values()];
}

/** Turn parsed rows into the KeywordRank ladder the module renders. A single import
 *  has no history yet, so history seeds to one point stamped at the import time
 *  (`at`, ISO date) and best = current = rank. */
export function ladderFromRows(rows: ParsedRankRow[], at: string = todayISO()): KeywordRank[] {
  const day = at.slice(0, 10);
  return rows.map((r) => ({
    id: ladderKey(r.keyword, r.area),
    keyword: r.keyword,
    area: r.area,
    history: [{ rank: r.rank, at: day }],
    current: r.rank,
    best: r.rank,
    untracked: false,
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
 *  real data. `prev` is expected already-normalized (RankPoint[] history).
 *
 *  RETENTION POLICY (D2): the import is a UNION with `prev`, not a replacement. A
 *  keyword present in the import gets its new dated point appended and is flagged
 *  `untracked: false`. A keyword in `prev` that the import OMITS is NOT deleted — its
 *  history is preserved untouched and it is flagged `untracked: true` ("not in the last
 *  import") so a partial/subset upload never silently drops a tracked keyword's climb.
 *  A keyword only in the import is a first-time entry. Matching is on the normalized
 *  keyword×area pair (ladderKey), so legacy slug ids re-key cleanly. Stamped at `at`. */
export function mergeLadder(
  prev: KeywordRank[],
  rows: ParsedRankRow[],
  at: string = todayISO()
): KeywordRank[] {
  const fresh = ladderFromRows(rows, at);
  const freshByKey = new Map(fresh.map((k) => [ladderKey(k.keyword, k.area), k]));
  const out: KeywordRank[] = [];
  const seen = new Set<string>();

  // Prev order first: update in place when re-imported, else retain + flag untracked.
  for (const p of prev) {
    const key = ladderKey(p.keyword, p.area);
    seen.add(key);
    const f = freshByKey.get(key);
    if (!f) {
      out.push({ ...p, untracked: true }); // omitted from this import → retained, flagged
      continue;
    }
    const history = [...p.history, ...f.history].slice(-HISTORY_CAP);
    out.push({
      ...p,
      keyword: f.keyword,
      area: f.area,
      history,
      current: f.current,
      best: Math.min(...history.map((pt) => pt.rank)),
      untracked: false,
    });
  }
  // New keywords the import introduced.
  for (const f of fresh) {
    if (!seen.has(ladderKey(f.keyword, f.area))) out.push(f);
  }
  return out;
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
    const row = k as Partial<KeywordRank> & { history?: unknown; untracked?: unknown };
    const history = coerceHistory(row.history, anchorISO);
    return {
      id: String(row.id ?? ""),
      keyword: String(row.keyword ?? ""),
      area: String(row.area ?? ""),
      history,
      current: history.length ? history[history.length - 1]!.rank : Number(row.current ?? 0),
      best: history.length ? Math.min(...history.map((p) => p.rank)) : Number(row.best ?? 0),
      // Preserve the D2 retention flag across reads (a subset re-import flags omitted
      // keywords 'untracked'; that flag must survive normalization, not reset to false).
      ...(row.untracked === true ? { untracked: true } : {}),
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

/** Classify a date cell (D2 ambiguity guard).
 *  - `ok`         → a confidently-parsed YYYY-MM-DD.
 *  - `ambiguous`  → a SLASH date `A/B/YYYY` where both A and B are 1..12 and differ,
 *                   so day-first (Czech, `D/M`) and month-first (US, `M/D`) disagree
 *                   and BOTH are plausible. We refuse to guess — the caller counts and
 *                   rejects the row rather than silently mis-dating a review.
 *  - `none`       → unrecognisable / out of range.
 *  Policy by separator: ISO is unambiguous; DOT dates `D.M.YYYY` are European day-first
 *  by convention (never treated as ambiguous); only SLASH dates carry US/EU ambiguity.
 *  A slash date with one value > 12 disambiguates (that value is the day). */
type DateVerdict = { kind: "ok"; at: string } | { kind: "ambiguous" } | { kind: "none" };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function classifyReviewDate(raw: string): DateVerdict {
  const s = raw.trim();
  if (!s) return { kind: "none" };
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { kind: "ok", at: `${m[1]}-${m[2]}-${m[3]}` };
  // Dot-separated → European day-first, unambiguous.
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return { kind: "none" };
    return { kind: "ok", at: `${m[3]}-${pad2(mon)}-${pad2(day)}` };
  }
  // Slash-separated → potentially ambiguous between D/M and M/D.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12 && a !== b) return { kind: "ambiguous" };
    // One value is >12 (or they're equal) → resolvable. Day-first preference.
    const day = a > 12 ? a : b > 12 ? b : a;
    const mon = a > 12 ? b : b > 12 ? a : b;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return { kind: "none" };
    return { kind: "ok", at: `${m[3]}-${pad2(mon)}-${pad2(day)}` };
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? { kind: "ok", at: new Date(t).toISOString().slice(0, 10) } : { kind: "none" };
}

/** Parse a date cell to YYYY-MM-DD, or null when unrecognisable OR ambiguous. Accepts
 *  ISO, Czech `D.M.YYYY`, and disambiguable slash dates; an ambiguous US/EU slash date
 *  (both parts 1..12) returns null so it is never silently mis-parsed — use
 *  {@link reviewDateAmbiguous} to tell an ambiguous rejection from an unparseable one. */
export function parseReviewDate(raw: string): string | null {
  const v = classifyReviewDate(raw);
  return v.kind === "ok" ? v.at : null;
}

/** True when a date cell is rejected specifically because it is US/EU-ambiguous. */
export function reviewDateAmbiguous(raw: string): boolean {
  return classifyReviewDate(raw).kind === "ambiguous";
}

/** The result of a tolerant review parse: the kept reviews plus how many rows were
 *  REJECTED specifically for an ambiguous US/EU slash date (surfaced to the importer
 *  so the user learns their dates were dropped rather than silently mis-dated). */
export interface ParsedReviews {
  items: ImportedReview[];
  /** rows dropped because their date was US/EU-ambiguous (never silently mis-parsed) */
  ambiguous: number;
}

/** Parse a pasted/CSV review export → imported reviews + an ambiguous-date count.
 *  Tolerant: a header row maps columns by name (cs/en); without one it assumes author,
 *  rating, text, date, area. Ratings clamp to 1..5; a row with no content is dropped; a
 *  row whose date is ambiguous (D/M vs M/D both plausible) is REJECTED and counted. */
export function parseReviews(text: string): ParsedReviews {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { items: [], ambiguous: 0 };

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
  let ambiguous = 0;
  let n = 0;
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line, delim);
    const author = cells[idx.author]?.trim() ?? "";
    const ratingRaw = Number((cells[idx.rating] ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
    const reviewText = cells[idx.text]?.trim() ?? "";
    const rawDate = cells[idx.at] ?? "";
    const at = parseReviewDate(rawDate);
    const area = cells[idx.area]?.trim() ?? "";
    if (!at) {
      if (reviewDateAmbiguous(rawDate)) ambiguous++; // rejected, not silently mis-parsed
      continue; // a review with no confident "when" is noise
    }
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
  return { items: out, ambiguous };
}

/** Back-compat thin wrapper — just the kept reviews (drops the ambiguous count). */
export function parseReviewRows(text: string): ImportedReview[] {
  return parseReviews(text).items;
}

// ── GBP import (D3) ──────────────────────────────────────────────────────────
// A Google Business Profile export gives the locations roster real inputs (status,
// review count, avg rating, unanswered) instead of pure seed. Same tolerant, capped,
// quote-aware ingestion as reviews; rows are matched to catalog localities on read.

const GBP_COL: Record<string, "name" | "status" | "reviews" | "rating" | "unanswered"> = {
  location: "name", name: "name", pobočka: "name", pobocka: "name", lokalita: "name", název: "name", nazev: "name", area: "name", oblast: "name", město: "name", mesto: "name",
  status: "status", stav: "status", connection: "status", připojení: "status", pripojeni: "status", gbp: "status",
  reviews: "reviews", recenze: "reviews", "počet recenzí": "reviews", "pocet recenzi": "reviews", count: "reviews",
  rating: "rating", hodnocení: "rating", hodnoceni: "rating", stars: "rating", avg: "rating", průměr: "rating", prumer: "rating",
  unanswered: "unanswered", nezodpovězené: "unanswered", nezodpovezene: "unanswered", pending: "unanswered", "bez odpovědi": "unanswered",
};

/** Map a free-text status cell to GBP connection health. Tolerant of cs/en wording;
 *  defaults to "connected" when the value is present but unrecognised. */
function parseGbpStatus(raw: string): ImportedGbpRow["status"] {
  const s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (/(disconnect|odpoj|off|inactive|neaktiv)/.test(s)) return "disconnected";
  if (/(attention|akce|pozor|warn|issue|vyzaduje|problem|chyb)/.test(s)) return "attention";
  return "connected";
}

function toCount(cell: string | undefined): number {
  const n = Number((cell ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Parse a pasted/CSV GBP export → imported location rows. Tolerant: a header row maps
 *  columns by name (cs/en); without one it assumes name, status, reviews, rating,
 *  unanswered. Rating clamps to 0..5, counts to ≥0; a row with no location name is
 *  dropped. Last write wins per (case/diacritic-insensitive) name. */
export function parseGbpRows(text: string): ImportedGbpRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = detectDelimiter(lines[0]!);
  const firstCells = splitCsvLine(lines[0]!, delim).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => GBP_COL[c]);
  const hasHeader = headerCols.some(Boolean);

  const idx = { name: 0, status: 1, reviews: 2, rating: 3, unanswered: 4 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const byName = new Map<string, ImportedGbpRow>();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line, delim);
    const name = cells[idx.name]?.trim() ?? "";
    if (!name) continue;
    const ratingRaw = Number((cells[idx.rating] ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
    const key = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    byName.set(key, {
      name,
      status: parseGbpStatus(cells[idx.status] ?? ""),
      reviews: toCount(cells[idx.reviews]),
      rating: Number.isFinite(ratingRaw) ? Math.min(5, Math.max(0, Math.round(ratingRaw * 10) / 10)) : 0,
      unanswered: toCount(cells[idx.unanswered]),
    });
  }
  return [...byName.values()];
}

/** Normalize a persisted LocalSignals blob on read: dual-shape ladder history is
 *  coerced to dated RankPoint[] anchored on the ladder's own sync time. The single
 *  read choke point (the store dispatcher) calls this so every consumer — resolver,
 *  recap grounding, UI — sees one shape without any read-time rewrite to disk. */
export function normalizeSignals(signals: LocalSignals): LocalSignals {
  const anchor = signals.meta?.syncedAt ?? todayISO();
  return { ...signals, ladder: normalizeLadder(signals.ladder, anchor) };
}
