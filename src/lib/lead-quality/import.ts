/** Pure parser + aggregation for imported CRM leads. A pasted/CSV lead export →
 *  `ImportedLead[]` → the `LeadSource[]` shape the funnel/velocity/alert math reads.
 *  The realistic ingestion for the lead funnel: no clean CRM API, so a business
 *  brings its own lead rows (source, stage, date, value?, closeDate?). Framework-
 *  free + unit-tested; the store/route just persist what this returns. Tolerant
 *  cs/en headers + stage values, quote-aware split (values contain commas), ratings
 *  clamped, rows without a parseable date dropped, capped. Mirrors local-signals/import. */
import type { LeadSource } from "./sample";
import { STAGE_RANK, type ImportedLead, type LeadStage, LEAD_ROW_CAP, SOURCE_MAX, VALUE_MAX } from "./types";

const DAY_MS = 86_400_000;

/** Header aliases (cs/en) → canonical column. Order-independent parsing. */
const COL: Record<string, "source" | "stage" | "at" | "value" | "closedAt"> = {
  source: "source", zdroj: "source", kanál: "source", kanal: "source", channel: "source", původ: "source", puvod: "source",
  stage: "stage", fáze: "stage", faze: "stage", status: "stage", stav: "stage", "fáze leadu": "stage",
  date: "at", datum: "at", at: "at", created: "at", vytvořeno: "at", vytvoreno: "at", "datum vzniku": "at",
  value: "value", hodnota: "value", částka: "value", castka: "value", amount: "value", revenue: "value", tržba: "value", trzba: "value", deal: "value",
  closedate: "closedAt", "close date": "closedAt", closed: "closedAt", "datum uzavření": "closedAt", "datum uzavreni": "closedAt", "uzavřeno dne": "closedAt", "won date": "closedAt",
};

/** Stage-value aliases (cs/en) → canonical stage. Diacritic/case-insensitive lookup. */
const STAGE: Record<string, LeadStage> = {
  lead: "lead", leady: "lead", novy: "lead", new: "lead", "novy lead": "lead", kontakt: "lead", poptavka: "lead",
  qualified: "qualified", kvalifikovany: "qualified", sql: "qualified", kvalifikace: "qualified", mql: "qualified", "kvalifikovany lead": "qualified",
  opportunity: "opportunity", opp: "opportunity", prilezitost: "opportunity", nabidka: "opportunity", jednani: "opportunity", proposal: "opportunity",
  won: "won", uzavreno: "won", vyhrano: "won", "closed won": "won", closed: "won", closedwon: "won", zaplaceno: "won", zakazka: "won",
};

/** Strip diacritics + lowercase for tolerant stage/header matching. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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

/** Split one CSV line on `delim`, honouring double-quoted fields (so a value may
 *  contain the delimiter). `""` inside a quoted field is a literal quote. */
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
export function parseLeadDate(raw: string): string | null {
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

/** Parse a value cell to a non-negative number clamped to VALUE_MAX, or undefined
 *  when blank/unparseable. Tolerates a decimal comma and stray currency symbols. */
function parseValue(cell: string | undefined): number | undefined {
  const raw = (cell ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, VALUE_MAX);
}

/** Parse a pasted/CSV lead export → imported leads. Tolerant: a header row maps
 *  columns by name (cs/en); without one it assumes source, stage, date, value,
 *  closeDate. A row with no parseable date, no source, or an unrecognised stage is
 *  dropped. Kept in input order, capped to LEAD_ROW_CAP. */
export function parseLeadRows(text: string): ImportedLead[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delim = detectDelimiter(lines[0]!);
  const firstCells = splitCsvLine(lines[0]!, delim).map(fold);
  const headerCols = firstCells.map((c) => COL[c]);
  const hasHeader = headerCols.some(Boolean);

  const idx = { source: 0, stage: 1, at: 2, value: 3, closedAt: 4 };
  if (hasHeader) {
    headerCols.forEach((col, i) => {
      if (col) idx[col] = i;
    });
  }

  const out: ImportedLead[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    if (out.length >= LEAD_ROW_CAP) break;
    const cells = splitCsvLine(line, delim);
    const source = (cells[idx.source] ?? "").trim().slice(0, SOURCE_MAX);
    const stage = STAGE[fold(cells[idx.stage] ?? "")];
    const at = parseLeadDate(cells[idx.at] ?? "");
    if (!source || !stage || !at) continue; // need source + a known stage + a date
    const lead: ImportedLead = { source, stage, at };
    const value = parseValue(cells[idx.value]);
    if (value !== undefined) lead.value = value;
    const closedAt = parseLeadDate(cells[idx.closedAt] ?? "");
    if (closedAt) lead.closedAt = closedAt;
    out.push(lead);
  }
  return out;
}

/** Working accumulator per source while rolling rows up into a LeadSource. */
interface Acc {
  source: string;
  leads: number;
  qualified: number;
  opportunities: number;
  won: number;
  revenue: number;
  /** at least one row was explicitly at the opportunity stage → include the stage */
  sawOpportunity: boolean;
  /** (closedAt − at) in days across won rows that carry both dates */
  closeSpans: number[];
}

/** Aggregate raw imported leads into the `LeadSource[]` shape the pure funnel/
 *  velocity/alert math consumes — grouped by source, cumulative stage counts
 *  (a won lead counts toward qualified + opportunity too), revenue summed from won
 *  rows' deal value. `spend` is 0 (a CRM export carries no ad spend), so CPL/CPQL
 *  are honestly omitted downstream (withMetrics → "—"); no `prior` (a single import
 *  has no baseline → no drift alerts). The opportunity stage is included only where
 *  the data actually uses it, and `daysToClose` only when won rows carry a close
 *  date — so the funnel/velocity degrade gracefully, never inventing a stage. Sorted
 *  by lead volume desc for a stable, meaningful order. */
export function aggregateLeads(items: ImportedLead[]): LeadSource[] {
  const by = new Map<string, Acc>();
  for (const it of items) {
    const key = it.source.toLowerCase();
    let a = by.get(key);
    if (!a) {
      a = { source: it.source, leads: 0, qualified: 0, opportunities: 0, won: 0, revenue: 0, sawOpportunity: false, closeSpans: [] };
      by.set(key, a);
    }
    const rank = STAGE_RANK[it.stage];
    a.leads += 1;
    if (rank >= STAGE_RANK.qualified) a.qualified += 1;
    if (rank >= STAGE_RANK.opportunity) a.opportunities += 1;
    if (it.stage === "opportunity") a.sawOpportunity = true;
    if (it.stage === "won") {
      a.won += 1;
      if (it.value !== undefined) a.revenue += it.value;
      if (it.closedAt) {
        const span = (Date.parse(`${it.closedAt}T00:00:00`) - Date.parse(`${it.at}T00:00:00`)) / DAY_MS;
        if (Number.isFinite(span) && span >= 0) a.closeSpans.push(span);
      }
    }
  }

  return [...by.values()]
    .sort((x, y) => y.leads - x.leads)
    .map((a) => {
      const src: LeadSource = {
        source: a.source,
        leads: a.leads,
        qualified: a.qualified,
        won: a.won,
        spend: 0,
        revenue: a.revenue,
      };
      // Include the opportunity stage only where the data actually tracks it, so a
      // lead/qualified/won-only funnel doesn't sprout a redundant opportunity=won stage.
      if (a.sawOpportunity) src.opportunities = a.opportunities;
      if (a.closeSpans.length > 0) {
        src.daysToClose = a.closeSpans.reduce((s, d) => s + d, 0) / a.closeSpans.length;
      }
      return src;
    });
}
