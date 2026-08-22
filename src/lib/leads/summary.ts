/** Aggregate view of a project's contacts — the counts a module renders ABOVE a
 *  list, so a thousand-row database can be read without paging through it.
 *
 *  PURE (the clock is passed in) and computed over whatever slice the caller loaded,
 *  which is why `scanned` and `capped` are part of the result: a summary that
 *  quietly described the first 2 000 of 9 000 contacts as "the project" would be
 *  the most expensive kind of wrong number. Counts by stage, source, grade and
 *  region, plus the SLA phase tally and the response-time band the queue renders.
 *
 *  It also carries the source × stage CROSS-TABULATION (`matrix`) the segment map
 *  renders — computed on the same single pass, because "which source is stuck in
 *  which stage" is not answerable from `byStage` and `bySource` side by side, and
 *  it is not worth a second scan. Its cumulative counts sit at lead-quality's
 *  ranks, so `winRate` here is the number `compute.ts#withMetrics` produces. */
import {
  PIPELINE_RANK,
  PIPELINE_STAGES,
  isTerminalStage,
  type Contact,
  type LeadGrade,
  type PipelineStage,
} from "./types";
import { sourceLabel } from "./aggregate";
import { contactSla, isQueued, queueAnalytics, type QueueAnalytics } from "./sla";

export interface CountRow {
  label: string;
  count: number;
}

/* ── the source × stage cross-tabulation ─────────────────────────────────────── */

/** The matrix's stage columns: the funnel in board order. The two terminal
 *  negatives are NOT columns — they are counted per row in `terminal`, because a
 *  "lost" column would sit in a grid whose other columns are cumulative-funnel
 *  states and read as a seventh step. */
export const MATRIX_STAGES: readonly PipelineStage[] = [
  "new",
  "working",
  "lead",
  "qualified",
  "opportunity",
  "won",
] as const;

/** How many source rows the matrix carries. A campaign-suffixed label set is
 *  unbounded (`sourceLabel` derives one per (source, campaign) pair), and a
 *  forty-row heat matrix is a table nobody reads. What did not fit is reported in
 *  `matrixOther` rather than silently dropped. */
export const MATRIX_SOURCE_CAP = 8;

/** One (source, stage) cell. `value` is `null` — not 0 — when no monetary data was
 *  supplied: a CRM contact carries no amount (money lives on `Deal`), and rendering
 *  an invented 0 Kč next to a real count is the expensive kind of wrong number. */
export interface MatrixCell {
  count: number;
  /** of those, queued past their SLA deadline */
  breached: number;
  /** of those, graded A or B */
  ab: number;
  /** Σ deal value in CZK, or null when the caller tracks no deal values */
  value: number | null;
}

export interface MatrixRow {
  /** the derived display label — identical to `bySource[].label` */
  label: string;
  /** every contact of this source, terminal negatives included. Byte-equal to the
   *  `leads` figure `contactsToLeadSources` produces for the same set. */
  total: number;
  /** of those, lost + disqualified */
  terminal: number;
  cells: Record<PipelineStage, MatrixCell>;
  /** CUMULATIVE funnel counts, at the same ranks `lead-quality` uses */
  qualified: number;
  won: number;
  /** won / qualified — the ratio `compute.ts#withMetrics` calls `winRate`; null
   *  when nothing qualified (a rate over zero is not 0 %, it is unknown) */
  winRate: number | null;
}

export interface SourceGradeRow {
  label: string;
  count: number;
  /** graded A or B */
  ab: number;
  /** ab / count, 0 when the source has no scored contact */
  abShare: number;
}

export interface SummaryOptions {
  /** Won deal value per contact id, joined by the caller when a deal tier exists.
   *  Absent ⇒ every `MatrixCell.value` is null (unknown), never 0. */
  dealValueByContact?: ReadonlyMap<string, number>;
}

export interface ContactSummary {
  /** contacts included in this aggregate */
  scanned: number;
  /** the scan hit its bound — the numbers describe a slice, not the project */
  capped: boolean;
  byStage: Record<PipelineStage, number>;
  bySource: CountRow[];
  /** `none` counts contacts that were never scored */
  byGrade: Record<LeadGrade | "none", number>;
  /** empty when no contact carries a region/city/postcode — never invented */
  byRegion: CountRow[];
  sla: { breached: number; warning: number; ontrack: number; settled: number };
  analytics: QueueAnalytics;
  /** source × stage cross-tabulation, biggest source first, capped at
   *  `MATRIX_SOURCE_CAP` rows. Computed in the SAME scan as everything above —
   *  a cross-tab is not worth a second pass over the contact set. */
  matrix: MatrixRow[];
  /** the sources the matrix cap left out — disclosed, never dropped silently */
  matrixOther: { sources: number; count: number };
  /** A/B-grade share per source (all sources, not just the matrix rows) */
  bySourceGrade: SourceGradeRow[];
}

/** The coarse location label for a contact: an explicit region wins, then the city,
 *  then the postcode's leading three digits (a Czech PSČ district — the coarsest
 *  honest grouping a bare postcode supports). `null` = not locatable. */
export function regionLabel(c: Contact): string | null {
  const region = c.region?.trim();
  if (region) return region;
  const city = c.city?.trim();
  if (city) return city;
  const psc = (c.postalCode ?? "").replace(/\s/g, "");
  return psc.length >= 3 ? `${psc.slice(0, 3)}xx` : null;
}

export function summarizeContacts(
  contacts: readonly Contact[],
  nowMs: number,
  capped = false,
  opts: SummaryOptions = {}
): ContactSummary {
  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<PipelineStage, number>;
  const byGrade: Record<LeadGrade | "none", number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  const sla = { breached: 0, warning: 0, ontrack: 0, settled: 0 };
  const sources = new Map<string, number>();
  const regions = new Map<string, number>();
  /** keyed by the FOLDED label, exactly as `contactsToLeadSources` groups */
  const rows = new Map<string, MatrixRow>();

  for (const c of contacts) {
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
    const grade = c.score?.grade ?? "none";
    byGrade[grade] += 1;

    const label = sourceLabel(c.attribution);
    sources.set(label, (sources.get(label) ?? 0) + 1);

    const region = regionLabel(c);
    if (region) regions.set(region, (regions.get(region) ?? 0) + 1);

    const queued = isQueued(c);
    const phase = queued ? contactSla(c, nowMs).phase : "settled";
    if (phase === "breached") sla.breached += 1;
    else if (phase === "warning") sla.warning += 1;
    else if (phase === "ontrack") sla.ontrack += 1;
    else sla.settled += 1;

    // ── the cross-tab, on the same pass ──
    const row = rowFor(rows, label);
    const cell = row.cells[c.stage];
    row.total += 1;
    cell.count += 1;
    if (phase === "breached") cell.breached += 1;
    if (grade === "A" || grade === "B") cell.ab += 1;
    const value = opts.dealValueByContact?.get(c.id);
    if (typeof value === "number" && Number.isFinite(value)) {
      cell.value = (cell.value ?? 0) + value;
    }
    if (isTerminalStage(c.stage)) row.terminal += 1;
    else {
      // Cumulative, at lead-quality's ranks — so `winRate` here and `withMetrics`
      // there are the same number computed twice, never two different numbers.
      if (PIPELINE_RANK[c.stage] >= PIPELINE_RANK.qualified) row.qualified += 1;
      if (PIPELINE_RANK[c.stage] >= PIPELINE_RANK.won) row.won += 1;
    }
  }

  const ordered = [...rows.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  for (const r of ordered) r.winRate = r.qualified > 0 ? r.won / r.qualified : null;
  const kept = ordered.slice(0, MATRIX_SOURCE_CAP);
  const rest = ordered.slice(MATRIX_SOURCE_CAP);

  return {
    scanned: contacts.length,
    capped,
    byStage,
    bySource: toRows(sources),
    byGrade,
    byRegion: toRows(regions),
    sla,
    analytics: queueAnalytics(contacts, nowMs),
    matrix: kept,
    matrixOther: { sources: rest.length, count: rest.reduce((s, r) => s + r.total, 0) },
    bySourceGrade: ordered.map((r) => {
      const ab = PIPELINE_STAGES.reduce((s, st) => s + r.cells[st].ab, 0);
      return { label: r.label, count: r.total, ab, abShare: r.total > 0 ? ab / r.total : 0 };
    }),
  };
}

function rowFor(rows: Map<string, MatrixRow>, label: string): MatrixRow {
  const key = label.toLowerCase();
  const hit = rows.get(key);
  if (hit) return hit;
  const row: MatrixRow = {
    label,
    total: 0,
    terminal: 0,
    cells: Object.fromEntries(
      PIPELINE_STAGES.map((s) => [s, { count: 0, breached: 0, ab: 0, value: null }])
    ) as Record<PipelineStage, MatrixCell>,
    qualified: 0,
    won: 0,
    winRate: null,
  };
  rows.set(key, row);
  return row;
}

/** Biggest first, then alphabetical — a stable order two renders cannot disagree on. */
function toRows(m: Map<string, number>): CountRow[] {
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
