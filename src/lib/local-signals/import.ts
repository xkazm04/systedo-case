/** Pure parser: a pasted/CSV rank export → a KeywordRank ladder. The realistic
 *  ingestion for A2 — map-pack rank has no clean API, so a business brings its own
 *  rank rows (from any tracker) as `keyword, oblast/area, pozice/rank`. Framework-
 *  free + unit-tested; the store/route just persist what this returns. */
import type { KeywordRank, RankPoint } from "@/lib/mappack/sample";
import type {
  ImportedCoverageRow,
  ImportedGbpRow,
  ImportedPackRow,
  ImportedReview,
  LocalEngine,
  LocalSignals,
} from "./types";

const DAY_MS = 86_400_000;

export interface ParsedRankRow {
  keyword: string;
  area: string;
  rank: number;
  /** the engine the rank was observed on. Set ONLY for `"seznam"` — a google row (the
   *  column absent, empty, or naming Google) carries no field at all, so the parsed
   *  row, the ladder built from it and the persisted blob stay byte-identical to
   *  before the dual-engine contract existed (W1-C legacy-read rule). */
  engine?: LocalEngine;
}

/** Header aliases (cs/en) → canonical column. Order-independent parsing. */
const COL: Record<string, "keyword" | "area" | "rank" | "engine"> = {
  keyword: "keyword", "klíčové slovo": "keyword", "klicove slovo": "keyword", dotaz: "keyword", query: "keyword",
  area: "area", oblast: "area", lokalita: "area", město: "area", mesto: "area", district: "area", čtvrť: "area", ctvrt: "area",
  rank: "rank", pozice: "rank", position: "rank", pořadí: "rank", poradi: "rank",
  engine: "engine", "vyhledávač": "engine", vyhledavac: "engine", zdroj: "engine", mapa: "engine",
};

// ── Engine column (W1-C) ─────────────────────────────────────────────────────
// Both local importers (ranks and pack) accept ONE optional extra column naming the
// search engine the observation came from, so a Czech business can bring its Mapy.cz /
// Firmy.cz positions into the same ladder as its Google ones. The column is optional
// everywhere: absent or empty means Google, which is what every pre-existing export is.

/** Accepted cell values → the canonical engine. Matched after a diacritic/case fold. */
const ENGINE_VALUES: Record<string, LocalEngine> = {
  google: "google", "google maps": "google", googlemaps: "google", "google mapy": "google", maps: "google", mapy_google: "google",
  seznam: "seznam", "seznam.cz": "seznam", seznamcz: "seznam", mapy: "seznam", "mapy.cz": "seznam", mapycz: "seznam",
  firmy: "seznam", "firmy.cz": "seznam", firmycz: "seznam",
};

/** Classify an engine cell.
 *  - `undefined` → the column is absent/empty ⇒ Google, and NOTHING is written.
 *  - a {@link LocalEngine} → a recognised value (case- and diacritic-insensitive).
 *  - `null` → a value that is present but unrecognised. Never guessed: mis-attributing
 *    a Seznam position to Google would silently corrupt both ladders, so the caller
 *    rejects the row with `invalid-engine` instead. */
export function parseEngineCell(raw: string | undefined): LocalEngine | null | undefined {
  const s = (raw ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!s) return undefined;
  return ENGINE_VALUES[s] ?? null;
}

/** The canonical identity of a keyword×area row — case/whitespace-normalized and
 *  joined with a pipe (a delimiter that cannot appear in the collapsed slug the old
 *  id used). This is BOTH the dedup key and the persisted `id`, so two visually-close
 *  areas like „Praha 4" and „Praha-4" no longer collapse to the same slug id and get
 *  merged into one keyword's history (D2 slug-collision fix). Legacy slug ids (`area-
 *  keyword`) still READ fine — the merge matches on this pair derived from the row's
 *  keyword/area fields, never on the stored id string, so old blobs re-key cleanly.
 *
 *  W1-C: the key is ENGINE-SCOPED, but only on the Seznam side — google keeps exactly
 *  `keyword|area` and seznam gets `keyword|area|seznam`. So every key (and every `id`
 *  derived from one) that existed before the dual-engine contract is unchanged, while
 *  the same keyword×area tracked on both engines is two independent histories. */
export function ladderKey(keyword: string, area: string, engine?: LocalEngine): string {
  const base = `${keyword.trim().toLowerCase()}|${area.trim().toLowerCase()}`;
  return engine && engine !== "google" ? `${base}|${engine}` : base;
}

function splitCells(line: string): string[] {
  // Accept comma, semicolon or tab separators (Sklik/GBP/Sheets exports vary).
  return line.split(/[,;\t]/).map((c) => c.trim());
}

/** A rank row rejected for a reason worth naming (today: only an unrecognised engine
 *  cell). The ranks importer stays TOLERANT — a bad row is skipped, the good ones are
 *  kept — but an engine we refuse to guess is reported rather than silently folded
 *  into Google, so the caller can tell the user which line to fix. */
export interface RankRowError {
  /** 1-based line number in the pasted text */
  line: number;
  code: Extract<PackRowErrorCode, "invalid-engine">;
}

export interface ParsedRanks {
  rows: ParsedRankRow[];
  errors: RankRowError[];
}

/** Parse a rank export. Tolerant: a header row maps columns by name; without a
 *  recognisable header it assumes `keyword, area, rank[, engine]`. Bad/short/duplicate
 *  rows are skipped (last write wins per keyword×area×engine). Ranks clamp to 1..100.
 *  A row whose optional `engine` cell holds an unrecognised value is skipped AND
 *  reported in `errors` — never guessed onto one of the two engines. */
export function parseRanks(text: string): ParsedRanks {
  const raw = text.split(/\r?\n/);
  const lines: { line: number; text: string }[] = [];
  raw.forEach((l, i) => {
    const trimmed = l.trim();
    if (trimmed) lines.push({ line: i + 1, text: trimmed });
  });
  if (lines.length === 0) return { rows: [], errors: [] };

  // Detect a header: a first row whose cells are all known column names.
  const firstCells = splitCells(lines[0]!.text).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => COL[c]);
  const hasHeader = headerCols.every(Boolean) && new Set(headerCols).size === headerCols.length;

  // Headerless order appends `engine` AFTER the three columns that always existed, so
  // every 3-column export parses exactly as before (cells[3] is simply absent).
  const idx = { keyword: 0, area: 1, rank: 2, engine: 3 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const byKey = new Map<string, ParsedRankRow>();
  const errors: RankRowError[] = [];
  for (const { line, text: row } of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCells(row);
    const keyword = cells[idx.keyword]?.trim();
    const area = cells[idx.area]?.trim();
    const rankRaw = Number(cells[idx.rank]?.replace(/[^\d.]/g, ""));
    if (!keyword || !area || !Number.isFinite(rankRaw) || rankRaw < 1) continue;
    const engine = parseEngineCell(cells[idx.engine]);
    if (engine === null) {
      errors.push({ line, code: "invalid-engine" });
      continue;
    }
    const rank = Math.min(100, Math.round(rankRaw));
    byKey.set(ladderKey(keyword, area, engine), {
      keyword,
      area,
      rank,
      ...(engine === "seznam" ? { engine } : {}),
    });
  }
  return { rows: [...byKey.values()], errors };
}

/** Back-compat thin wrapper — just the kept rank rows (drops the coded errors), the
 *  shape every existing caller reads. Mirrors parseReviewRows over parseReviews. */
export function parseRankRows(text: string): ParsedRankRow[] {
  return parseRanks(text).rows;
}

/** Turn parsed rows into the KeywordRank ladder the module renders. A single import
 *  has no history yet, so history seeds to one point stamped at the import time
 *  (`at`, ISO date) and best = current = rank. */
export function ladderFromRows(rows: ParsedRankRow[], at: string = todayISO()): KeywordRank[] {
  const day = at.slice(0, 10);
  return rows.map((r) => ({
    id: ladderKey(r.keyword, r.area, r.engine),
    keyword: r.keyword,
    area: r.area,
    history: [{ rank: r.rank, at: day }],
    current: r.rank,
    best: r.rank,
    untracked: false,
    // Never written for google — see the legacy-read rule on LocalEngine.
    ...(r.engine === "seznam" ? { engine: r.engine } : {}),
  }));
}

/** Last N dated points of per-keyword rank history to retain (a ~1-year sliding
 *  window at monthly imports). Only the sparkline TREND is windowed to this cap —
 *  the all-time `best` is carried forward across it in {@link mergeLadder} so a
 *  keyword's record position can't silently worsen when an old point slides out. */
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
  const freshByKey = new Map(fresh.map((k) => [ladderKey(k.keyword, k.area, k.engine), k]));
  const out: KeywordRank[] = [];
  const seen = new Set<string>();

  // Prev order first: update in place when re-imported, else retain + flag untracked.
  // The key is engine-scoped (google keeps the historical `keyword|area` form), so the
  // same keyword×area tracked on Google and on Seznam are two independent histories
  // and neither import ever flags the other engine's rows untracked.
  // Which engines this import actually speaks for. A row belonging to an engine the
  // import never mentions is passed through VERBATIM — not flagged `untracked`, because
  // "absent from the last import" would be a lie about a Google keyword when the user
  // only uploaded their Seznam ladder. Empty `rows` keeps the pre-W1-C behaviour.
  const freshEngines = new Set(fresh.map((k) => k.engine ?? "google"));
  for (const p of prev) {
    const key = ladderKey(p.keyword, p.area, p.engine);
    seen.add(key);
    const f = freshByKey.get(key);
    if (!f) {
      if (freshEngines.size > 0 && !freshEngines.has(p.engine ?? "google")) {
        out.push(p); // another engine's row — this import says nothing about it
        continue;
      }
      out.push({ ...p, untracked: true }); // omitted from this import → retained, flagged
      continue;
    }
    // Append each fresh point, but REPLACE an existing point stamped the same day (a
    // same-day re-import to fix a typo'd CSV must correct today's observation, not
    // stack a second point that fakes a 0-day trend and flushes real history out).
    const merged = [...p.history];
    for (const pt of f.history) {
      const lastDay = merged[merged.length - 1]?.at;
      if (lastDay === pt.at) merged[merged.length - 1] = pt;
      else merged.push(pt);
    }
    const history = merged.slice(-HISTORY_CAP);
    out.push({
      ...p,
      keyword: f.keyword,
      area: f.area,
      history,
      current: f.current,
      // Carry the all-time best FORWARD across the window cap: min of the prior best
      // and the fresh points, so a record position isn't erased when an old point
      // slides past HISTORY_CAP (the field is documented + rendered as "best").
      best: Math.min(p.best, ...f.history.map((pt) => pt.rank)),
      untracked: false,
    });
  }
  // New keywords the import introduced.
  for (const f of fresh) {
    if (!seen.has(ladderKey(f.keyword, f.area, f.engine))) out.push(f);
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
    const row = k as Partial<KeywordRank> & { history?: unknown; untracked?: unknown; engine?: unknown };
    const history = coerceHistory(row.history, anchorISO);
    // W1-C: carry a STORED engine through, and never synthesize one. A legacy row (no
    // engine) must come out of normalization without the field, or every read would
    // rewrite the blob's shape and break the byte-identity the sample path depends on.
    const engine = row.engine === "seznam" || row.engine === "google" ? row.engine : undefined;
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
      ...(engine ? { engine } : {}),
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

/** Map a free-text status cell to GBP connection health. Tolerant of cs/en wording.
 *  FAIL-ATTENTION, not fail-healthy: a present-but-unrecognised status (e.g.
 *  "suspended", "pozastaveno", "pending verification") maps to `attention`, never the
 *  healthiest `connected` — this field feeds `needsAttention`/`attentionScore`, so an
 *  optimistic default would hide the worst-off profiles (a suspended GBP is the classic
 *  emergency) from the urgency queue. `connected` is reserved for explicit affirmatives.
 *  An EMPTY cell (no status column) stays `connected` — absence is not a problem signal. */
function parseGbpStatus(raw: string): ImportedGbpRow["status"] {
  const s = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return "connected";
  if (/(disconnect|odpoj|off|inactive|neaktiv)/.test(s)) return "disconnected";
  if (/(attention|akce|pozor|warn|issue|vyzaduje|problem|chyb)/.test(s)) return "attention";
  if (/(connect|pripoj|aktiv|verif|overen|live|active|zdrav|healthy|funguj)/.test(s) || s === "ok")
    return "connected";
  return "attention"; // present but unrecognised → surface it, don't bury it
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

// ── Coverage import (D1) ─────────────────────────────────────────────────────
// Page-presence per service×locality is the 7th import-first seam. Today it is pure
// catalog seed (targetsFromCatalog.hasPage = a hash threshold no action ever flips);
// this brings the truth in, fed by a tolerant CSV (service, locality, hasPage) AND by
// per-cell manual toggles on the matrix. Same tolerant/deduped ingestion conventions.

const COVERAGE_COL: Record<string, "service" | "locality" | "hasPage"> = {
  service: "service", služba: "service", sluzba: "service", "služba/produkt": "service",
  locality: "locality", lokalita: "locality", oblast: "locality", město: "locality", mesto: "locality", area: "locality", pobočka: "locality", pobocka: "locality", location: "locality", district: "locality",
  haspage: "hasPage", page: "hasPage", "má stránku": "hasPage", "ma stranku": "hasPage", stránka: "hasPage", stranka: "hasPage", pokrytí: "hasPage", pokryti: "hasPage", coverage: "hasPage", covered: "hasPage", microsite: "hasPage",
};

/** Coerce a page-presence cell to a boolean. Explicit negatives (ne/no/false/0/chybí)
 *  → false; explicit affirmatives (ano/yes/true/1/má stránku/hotovo) → true; an empty
 *  or unrecognised cell defaults to FALSE (a missing page is the honest default gap). */
export function parseHasPage(raw: string | undefined): boolean {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return false;
  if (/^(ne|no|false|0|n|chybi|bez|nema|missing|x)$/.test(s) || /chybi|bez stranky|nema/.test(s)) return false;
  if (/^(ano|yes|true|1|y|a|ma|hotovo|existuje|covered|ok)$/.test(s) || /ma stranku|existuje|hotovo/.test(s)) return true;
  return false;
}

/** The canonical identity of a coverage row. Folds diacritics (NFD + strip combining
 *  marks, the same fold parseGbpRows/parseGbpStatus use) on TOP of trim+lowercase, so a
 *  coverage CSV typed without diacritics (`Plzen`, `Usti`) still overlays the catalog-
 *  seeded target whose locality is `Plzeň`/`Ústí`. Without the fold the import silently
 *  no-ops on the common Czech path (resolveCoverage keys BOTH sides through here, so the
 *  fold matches imported rows to seeds symmetrically). */
export function coverageKey(service: string, locality: string): string {
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return `${fold(service)}|${fold(locality)}`;
}

/** Parse a pasted/CSV coverage export → page-presence rows. Tolerant: a header row maps
 *  columns by name (cs/en); without one it assumes service, locality, hasPage. Last
 *  write wins per (case/whitespace-insensitive) service|locality. A row missing the
 *  service or locality is dropped. */
export function parseCoverageRows(text: string): ImportedCoverageRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = detectDelimiter(lines[0]!);
  const firstCells = splitCsvLine(lines[0]!, delim).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => COVERAGE_COL[c]);
  const hasHeader = headerCols.some(Boolean);

  const idx = { service: 0, locality: 1, hasPage: 2 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const byKey = new Map<string, ImportedCoverageRow>();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line, delim);
    const service = cells[idx.service]?.trim() ?? "";
    const locality = cells[idx.locality]?.trim() ?? "";
    if (!service || !locality) continue;
    byKey.set(coverageKey(service, locality), { service, locality, hasPage: parseHasPage(cells[idx.hasPage]) });
  }
  return [...byKey.values()];
}

/** Union-merge new coverage rows onto the previously-persisted ones (D1 RETENTION):
 *  an import (or a single-cell toggle) UPSERTS by service|locality, so a partial upload
 *  or one toggled cell never drops the other combinations' recorded page-presence. New
 *  rows win on conflict; untouched combos are preserved verbatim. Pure. */
export function mergeCoverage(
  prev: ImportedCoverageRow[],
  rows: ImportedCoverageRow[]
): ImportedCoverageRow[] {
  const byKey = new Map(prev.map((r) => [coverageKey(r.service, r.locality), r]));
  for (const r of rows) byKey.set(coverageKey(r.service, r.locality), r);
  return [...byKey.values()];
}

// ── Map-pack import (E1) ─────────────────────────────────────────────────────
// The competitor pack is the last purely-synthesized surface on the local-SEO map:
// packForArea seeds five listings per locality with rival names drawn from a six-item
// hardcoded list, rendered on real OSM tiles. This brings the real pack in.
//
// STRICT, unlike every other section here. Ranks/reviews/GBP/coverage are tolerant
// (skip the bad row, keep the good ones) because a missing row there is a missing row.
// A map pack is a RANKING: silently dropping one competitor renames every position
// below it and rewrites share-of-voice, so a partial pack is worse than no pack. Any
// malformed data row therefore FAILS THE WHOLE IMPORT with a coded, line-numbered
// error and nothing is persisted.

const PACK_COL: Record<string, "area" | "name" | "rank" | "rating" | "reviews" | "you" | "lat" | "lng" | "engine"> = {
  area: "area", oblast: "area", lokalita: "area", město: "area", mesto: "area", district: "area", čtvrť: "area", ctvrt: "area",
  name: "name", název: "name", nazev: "name", business: "name", podnik: "name", firma: "name", company: "name", listing: "name",
  rank: "rank", pozice: "rank", position: "rank", pořadí: "rank", poradi: "rank",
  rating: "rating", hodnocení: "rating", hodnoceni: "rating", stars: "rating", hvězdy: "rating", hvezdy: "rating",
  reviews: "reviews", recenze: "reviews", "počet recenzí": "reviews", "pocet recenzi": "reviews",
  you: "you", vy: "you", vaše: "you", vase: "you", self: "you", mine: "you", "můj podnik": "you", "muj podnik": "you",
  lat: "lat", latitude: "lat", "šířka": "lat", sirka: "lat",
  lng: "lng", lon: "lng", long: "lng", longitude: "lng", délka: "lng", delka: "lng",
  engine: "engine", "vyhledávač": "engine", vyhledavac: "engine", zdroj: "engine", mapa: "engine",
};

/** Why one pack row was rejected. Machine-readable so the route can return a coded
 *  error envelope instead of a prose-only 400. */
export type PackRowErrorCode =
  | "missing-area"
  | "missing-name"
  | "bad-rank"
  | "bad-rating"
  | "bad-reviews"
  | "bad-coords"
  | "duplicate-rank"
  | "duplicate-name"
  /** the optional `engine` column held a value that is neither Google nor Seznam —
   *  refused rather than guessed onto one of them (W1-C). Shared with the ranks
   *  importer's {@link RankRowError}. */
  | "invalid-engine";

export interface PackRowError {
  /** 1-based line number in the pasted text, so the user can find the row */
  line: number;
  code: PackRowErrorCode;
}

export interface ParsedPack {
  rows: ImportedPackRow[];
  /** every rejected row — non-empty means the caller must persist NOTHING */
  errors: PackRowError[];
}

/** Highest map-pack position we accept. Google's local pack is three deep and the
 *  "more places" view runs to twenty; beyond that the number is a typo, not a rank. */
const MAX_PACK_RANK = 20;

function truthyFlag(raw: string | undefined): boolean {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return false;
  return /^(ano|yes|true|1|y|a|vy|me|mine|self|x)$/.test(s);
}

/** Parse a pasted/CSV map-pack export → the named competitor listings for each area.
 *  Tolerant about SHAPE (cs/en header aliases in any order, comma/semicolon/tab, quoted
 *  cells); STRICT about CONTENT (see the section note): every non-empty data row must
 *  carry an area, a name, a rank in 1..20, a rating in 0..5 and a review count ≥ 0, and
 *  lat/lng must be supplied together and in range if at all. Positions and names must be
 *  unique within an area. Anything else is reported in `errors` with its line number and
 *  a code — the caller rejects the import rather than persisting a partial pack.
 *
 *  Without a recognisable header the columns are assumed to be
 *  `area, name, rank, rating, reviews[, you][, lat, lng]`. */
export function parsePackRows(text: string): ParsedPack {
  const raw = text.split(/\r?\n/);
  const lines: { line: number; text: string }[] = [];
  raw.forEach((l, i) => {
    const trimmed = l.trim();
    if (trimmed) lines.push({ line: i + 1, text: trimmed });
  });
  if (lines.length === 0) return { rows: [], errors: [] };

  const delim = detectDelimiter(lines[0]!.text);
  const firstCells = splitCsvLine(lines[0]!.text, delim).map((c) => c.toLowerCase());
  const headerCols = firstCells.map((c) => PACK_COL[c]);
  const hasHeader = headerCols.some(Boolean);

  // `engine` is appended AFTER every column that existed before it, so a headerless
  // export written against the old contract (at most 8 cells) parses identically.
  const idx: Record<"area" | "name" | "rank" | "rating" | "reviews" | "you" | "lat" | "lng" | "engine", number> = {
    area: 0, name: 1, rank: 2, rating: 3, reviews: 4, you: 5, lat: 6, lng: 7, engine: 8,
  };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const num = (cell: string | undefined) => Number((cell ?? "").replace(",", ".").replace(/[^\d.\-]/g, ""));
  const rows: ImportedPackRow[] = [];
  const errors: PackRowError[] = [];
  const seenRank = new Set<string>();
  const seenName = new Set<string>();
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

  for (const { line, text: raw } of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(raw, delim);
    const push = (code: PackRowErrorCode) => errors.push({ line, code });

    const area = cells[idx.area]?.trim() ?? "";
    if (!area) {
      push("missing-area");
      continue;
    }
    const name = cells[idx.name]?.trim() ?? "";
    if (!name) {
      push("missing-name");
      continue;
    }
    const rank = num(cells[idx.rank]);
    if (!Number.isFinite(rank) || rank < 1 || rank > MAX_PACK_RANK || !Number.isInteger(rank)) {
      push("bad-rank");
      continue;
    }
    const rating = num(cells[idx.rating]);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5 || (cells[idx.rating] ?? "").trim() === "") {
      push("bad-rating");
      continue;
    }
    const reviews = num(cells[idx.reviews]);
    if (!Number.isFinite(reviews) || reviews < 0 || (cells[idx.reviews] ?? "").trim() === "") {
      push("bad-reviews");
      continue;
    }

    // Coordinates are optional but all-or-nothing: half a coordinate pair would either
    // be dropped silently or pinned at the equator, so it is a rejection.
    const latCell = (cells[idx.lat] ?? "").trim();
    const lngCell = (cells[idx.lng] ?? "").trim();
    let lat: number | undefined;
    let lng: number | undefined;
    if (latCell || lngCell) {
      const latN = num(latCell);
      const lngN = num(lngCell);
      if (
        !latCell || !lngCell ||
        !Number.isFinite(latN) || !Number.isFinite(lngN) ||
        Math.abs(latN) > 90 || Math.abs(lngN) > 180
      ) {
        push("bad-coords");
        continue;
      }
      lat = latN;
      lng = lngN;
    }

    // W1-C: an unrecognised engine is a hard rejection like any other bad cell — a pack
    // is a RANKING, and filing a Mapy.cz position under Google would corrupt both.
    const engine = parseEngineCell(cells[idx.engine]);
    if (engine === null) {
      push("invalid-engine");
      continue;
    }

    // Uniqueness is scoped per (area, ENGINE): a Seznam pack for „Praha 4" is a second
    // observation of the same area, not a duplicate of the Google one. The google scope
    // string keeps its historical `area|…` form so nothing about the single-engine path
    // changes.
    const areaKey = engine === "seznam" ? `${fold(area)}|seznam` : fold(area);
    if (seenRank.has(`${areaKey}|${rank}`)) {
      push("duplicate-rank");
      continue;
    }
    if (seenName.has(`${areaKey}|${fold(name)}`)) {
      push("duplicate-name");
      continue;
    }
    seenRank.add(`${areaKey}|${rank}`);
    seenName.add(`${areaKey}|${fold(name)}`);

    rows.push({
      area,
      name,
      rank,
      rating: Math.round(rating * 10) / 10,
      reviews: Math.round(reviews),
      you: truthyFlag(cells[idx.you]),
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      ...(engine === "seznam" ? { engine } : {}),
    });
  }

  return { rows, errors };
}

/** Fold a NEW pack import onto the stored pack rows, ENGINE BY ENGINE (W1-C).
 *
 *  A pack is a snapshot, not an accumulating history, so within one engine the import
 *  still REPLACES outright — the semantics the strict importer was built around. What
 *  changes is that the replacement is scoped: an upload carrying only Google rows
 *  leaves an earlier Seznam pack exactly where it was, and vice versa, so the two
 *  engines can be maintained on their own cadences instead of overwriting each other.
 *
 *  A Google-only import onto a Google-only pack returns `rows` unchanged — byte-for-byte
 *  the old replace — so nothing about the single-engine path moves. Pure. */
export function mergePackRows(
  prev: ImportedPackRow[],
  rows: ImportedPackRow[]
): ImportedPackRow[] {
  const replacing = new Set(rows.map((r) => r.engine ?? "google"));
  const kept = prev.filter((r) => !replacing.has(r.engine ?? "google"));
  return kept.length > 0 ? [...kept, ...rows] : rows;
}

/** Normalize a persisted LocalSignals blob on read: dual-shape ladder history is
 *  coerced to dated RankPoint[] anchored on the ladder's own sync time. The single
 *  read choke point (the store dispatcher) calls this so every consumer — resolver,
 *  recap grounding, UI — sees one shape without any read-time rewrite to disk. */
export function normalizeSignals(signals: LocalSignals): LocalSignals {
  const anchor = signals.meta?.syncedAt ?? todayISO();
  return { ...signals, ladder: normalizeLadder(signals.ladder, anchor) };
}
