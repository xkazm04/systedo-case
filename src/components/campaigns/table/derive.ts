"use client";

/** Pure view-derivation for CampaignTable, extracted so the expensive pass —
 *  withMetrics + the full triage rule engine per campaign (including the
 *  slow-bleed scan over each campaign's daily series) + the portfolio summary —
 *  can be memoised on its REAL data inputs ([campaigns, changesById, goals,
 *  campaignSeries]), while the cheap filter / sort / search layers re-run on
 *  their own inputs. Typing in the search box changes only the local query state,
 *  so the derive memo is preserved and `filterCampaignRows` is the only thing
 *  that re-runs — the rule engine never fires per keystroke.
 *
 *  No JSX, no hooks: it is unit-testable and its triage call-count is assertable
 *  (see test-unit/campaigns-table-derive.test.mjs). */
import {
  withMetrics,
  type AdsSource,
  type Campaign,
  type CampaignChange,
  type CampaignRow,
  type CampaignStatus,
  type CampaignType,
  type DailyPoint,
} from "@/lib/campaigns/types";
import {
  SEVERITY_RANK,
  triage as triageRow,
  type SlowBleedPoint,
  type TriageGoals,
  type TriageResult,
  type TriageSummary,
} from "@/lib/campaigns/triage";
import type { SortState } from "./sort";

/** One derived table row: the with-metrics campaign paired with its triage
 *  classification. The badge, the filter, the sort and the batch queue all read
 *  this same `tr`, so they can never disagree. */
export interface DerivedRow {
  c: CampaignRow;
  tr: TriageResult;
}

export interface DerivedRows {
  /** every campaign, with derived ratios — drives the toolbar's total count */
  all: CampaignRow[];
  /** every campaign paired with its triage result (most-severe reason first) */
  rows: DerivedRow[];
  /** portfolio-wide severity rollup — independent of the active filters */
  summary: TriageSummary;
}

/** The signature of the rule engine, exposed so a unit test can pass a counting
 *  wrapper; production always uses the real {@link triageRow}. */
type TriageFn = (
  c: CampaignRow,
  change?: CampaignChange,
  goals?: TriageGoals,
  history?: readonly SlowBleedPoint[]
) => TriageResult;

/** The expensive layer: derive ratios + triage EVERY campaign exactly once, and
 *  roll the severities up into the banner summary from those same results — so
 *  the old double pass (a separate `summarize()` that re-triaged every row the
 *  rows map had already triaged) is gone. Memoise this on
 *  [campaigns, changesById, goals, campaignSeries]; the filter / sort layers
 *  below consume its output and never re-trigger it. */
export function deriveCampaignRows(
  campaigns: Campaign[],
  changesById: Record<string, CampaignChange>,
  goals?: TriageGoals,
  campaignSeries?: Record<string, DailyPoint[]>,
  triageFn: TriageFn = triageRow
): DerivedRows {
  const all = campaigns.map(withMetrics);
  const rows: DerivedRow[] = all.map((c) => ({
    c,
    tr: triageFn(c, changesById[c.id], goals, campaignSeries?.[c.id]),
  }));
  let critical = 0;
  let warning = 0;
  for (const { tr } of rows) {
    if (tr.severity === "critical") critical++;
    else if (tr.severity === "warning") warning++;
  }
  const summary: TriageSummary = {
    critical,
    warning,
    attention: critical + warning,
    ok: rows.length - critical - warning,
    total: rows.length,
  };
  return { all, rows, summary };
}

export interface RowFilter {
  /** already trimmed + lower-cased search term */
  query: string;
  typeFilter: CampaignType | "all";
  statusFilter: CampaignStatus | "all";
  attentionOnly: boolean;
  /** ADR-0010 — narrow the union read to ONE ad network. Optional and defaulting
   *  to "all", so a single-source project (which never offers the filter) and
   *  every pre-union caller are byte-identical. */
  sourceFilter?: AdsSource | "all";
}

/** Cheap layer: narrow the derived rows to the active filter. Reads only the
 *  already-computed `tr.severity` and the campaign's own fields — it never
 *  re-triages, so a search keystroke costs one linear scan, not a portfolio-wide
 *  re-classification. */
export function filterCampaignRows(rows: DerivedRow[], f: RowFilter): DerivedRow[] {
  return rows.filter(({ c, tr }) => {
    if (f.sourceFilter && f.sourceFilter !== "all" && c.source !== f.sourceFilter) return false;
    if (f.typeFilter !== "all" && c.type !== f.typeFilter) return false;
    if (f.statusFilter !== "all" && c.status !== f.statusFilter) return false;
    if (f.attentionOnly && tr.severity === "ok") return false;
    if (f.query && !c.name.toLowerCase().includes(f.query)) return false;
    return true;
  });
}

/** Cheap layer: order the (already filtered) rows. Returns a NEW array — the
 *  input is a memoised list shared across sort changes, so it must never be
 *  sorted in place. */
export function sortCampaignRows(rows: DerivedRow[], sort: SortState): DerivedRow[] {
  return [...rows].sort((a, b) => {
    let cmp: number;
    if (sort.key === "severity") {
      cmp = SEVERITY_RANK[a.tr.severity] - SEVERITY_RANK[b.tr.severity];
      if (cmp === 0) cmp = a.c.cost - b.c.cost; // tie-break: bigger spend first
    } else if (sort.key === "name") {
      cmp = a.c.name.localeCompare(b.c.name, "cs");
    } else {
      // "—" rows (no revenue → PNO=0, no conversions → CPA=0 from safe()) are the
      // WORST on these "lower is better" metrics, not the best — map them to +∞ so
      // a worst-first (desc) sort surfaces them instead of burying them next to the
      // healthiest campaigns. ROAS/cost/conversions/value keep their real 0.
      const lowerIsBetter = sort.key === "pno" || sort.key === "cpa";
      const av = lowerIsBetter && a.c[sort.key] <= 0 ? Infinity : a.c[sort.key];
      const bv = lowerIsBetter && b.c[sort.key] <= 0 ? Infinity : b.c[sort.key];
      cmp = av === bv ? 0 : av < bv ? -1 : 1;
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });
}
