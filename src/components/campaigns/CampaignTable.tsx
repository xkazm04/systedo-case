"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Bolt, ChevronDown, Download, Gauge, Search, Sparkles, TrendDown } from "@/components/icons";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  aggregate,
  budgetPacing,
  activeBudgetDays,
  campaignStatusLabel,
  dailyMetricValues,
  seriesSupportsMetric,
  type Campaign,
  type CampaignChange,
  type CampaignPeriod,
  type CampaignStatus,
  type CampaignType,
  type SeriesMetric,
} from "@/lib/campaigns/types";
import {
  pnoMetricTone,
  roasMetricTone,
  severityLabel,
  triageReasonLabel,
  triageWeight,
  type MetricTone,
  type Severity,
  type TriageGoals,
} from "@/lib/campaigns/triage";
import type { CampaignReport, ReportHistoryPoint } from "@/lib/ai-types";
import type { DailyPoint } from "@/lib/campaigns/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import Sparkline from "@/components/charts/Sparkline";
import ReportView from "./ReportView";
import PillButton from "./PillButton";
import TriageBanner from "./TriageBanner";
import { useCampaignErrorText, type CampaignError } from "./errors";
import SortHeader from "./table/SortHeader";
import { SORT_KEYS, loadSort, saveSort, type SortKey, type SortState } from "./table/sort";
import { loadFilters, saveFilters } from "./table/filters";
import { useBatchRunner } from "./table/useBatchRunner";
import { exportCampaignsCsv } from "./table/csv";
import { deriveCampaignRows, filterCampaignRows, sortCampaignRows } from "./table/derive";
import SourceBadge, { SourceReadOnlyHint } from "./table/SourceBadge";
import SourceFilter, { type SourceFilterValue } from "./table/SourceFilter";
import RowFunnel from "./table/RowFunnel";
import type { CampaignsSourceMeta } from "./useCampaigns";

const T = {
  cs: {
    sortTitle: "Seřadit podle „{col}“",
    searchPlaceholder: "Hledat kampaň…",
    searchAriaLabel: "Hledat kampaň podle názvu",
    filterTypeAriaLabel: "Filtrovat podle typu kampaně",
    filterTypeAll: "Všechny typy",
    filterStatusAriaLabel: "Filtrovat podle stavu kampaně",
    filterStatusAll: "Všechny stavy",
    attentionButton: "Vyžaduje pozornost",
    attentionTitle: "Zobrazit jen kampaně, které porušují některé z pravidel triáže",
    clearFilters: "Zrušit filtry",
    countFiltered: "{shown} z {total}",
    countAll: "{n} kampaní",
    colAiReport: "AI report",
    emptyNoMatch: "Žádná kampaň neodpovídá zadanému filtru.",
    okLabel: "V pořádku",
    okTitle: "Plní cíl",
    preparePackage: "Připravit balíček",
    preparingPackage: "Připravuji…",
    preparePackageFailed: "Přípravu balíčku se nepodařilo dokončit.",
    preparePackageTitle:
      "Vytvořit změnový balíček pro tuto kampaň v Řízení rozpočtů níže (simulace → schválení → vrácení)",
    analyzePriorityTitle: "Doporučeno vyhodnotit prioritně",
    analyzing: "Analyzuji…",
    analyze: "Analyzovat",
    evaluatingCampaign: "Vyhodnocuji kampaň „{name}“…",
    retryButton: "Zkusit znovu",
    evalHeading: "AI vyhodnocení: {name}",
    reanalyze: "Přeanalyzovat",
    colPriority: "Priorita",
    colCampaign: "Kampaň",
    colCost: "Náklady",
    colConversions: "Konverze",
    colConvValue: "Hodnota konv.",
    colRoas: "ROAS",
    colPno: "PNO",
    reportShow: "report",
    reportHide: "skrýt",
    exportCsv: "Exportovat CSV",
    exportCsvTitle: "Stáhnout zobrazené kampaně jako CSV",
    csvFilename: "adamant-kampane.csv",
    csvType: "Typ",
    csvStatus: "Stav",
    csvReason: "Hlavní nález",
    csvScore: "AI skóre",
    budgetCapped: "Omezeno rozpočtem",
    budgetCappedTitle:
      "ROAS {roas} nad cílem, vyčerpáno {pacing} rozpočtu ({budget}/den): vítěz, kterého brzdí rozpočet",
    colTrend: "Trend",
    trendCost: "Náklady",
    trendCtr: "CTR",
    trendCpc: "CPC",
    trendMetricAria: "Zvolit metriku trendu",
    sparkAria: "Denní náklady kampaně „{name}“: {start} první den období, {end} poslední den.",
    sparkAriaMetric: "Denní {metric} kampaně „{name}“",
    footerLabel: "Součet filtru ({n})",
    footerTitle:
      "Souhrn právě vyfiltrovaných kampaní: ROAS a PNO jsou přepočítané ze součtů, ne průměrované",
    severityPillTitle: "Zobrazit nálezy triáže v detailu řádku",
    triageHeading: "Proč vyžaduje pozornost",
    csvImpressions: "Zobrazení",
    csvClicks: "Prokliky",
    csvConvRate: "Konv. poměr %",
  },
  en: {
    sortTitle: "Sort by “{col}”",
    searchPlaceholder: "Search campaign…",
    searchAriaLabel: "Search campaign by name",
    filterTypeAriaLabel: "Filter by campaign type",
    filterTypeAll: "All types",
    filterStatusAriaLabel: "Filter by campaign status",
    filterStatusAll: "All statuses",
    attentionButton: "Needs attention",
    attentionTitle: "Show only campaigns that breach a triage rule",
    clearFilters: "Clear filters",
    countFiltered: "{shown} of {total}",
    countAll: "{n} campaigns",
    colAiReport: "AI report",
    emptyNoMatch: "No campaign matches the active filter.",
    okLabel: "On target",
    okTitle: "Meeting goal",
    preparePackage: "Stage change set",
    preparingPackage: "Staging…",
    preparePackageFailed: "Couldn't stage the change set.",
    preparePackageTitle:
      "Create a change set for this campaign in Budget management below (simulate → approve → revert)",
    analyzePriorityTitle: "Recommended to evaluate first",
    analyzing: "Analyzing…",
    analyze: "Analyze",
    evaluatingCampaign: "Evaluating campaign “{name}”…",
    retryButton: "Retry",
    evalHeading: "AI evaluation: {name}",
    reanalyze: "Re-analyze",
    colPriority: "Priority",
    colCampaign: "Campaign",
    colCost: "Cost",
    colConversions: "Conversions",
    colConvValue: "Conv. value",
    colRoas: "ROAS",
    colPno: "PNO",
    reportShow: "report",
    reportHide: "hide",
    exportCsv: "Export CSV",
    exportCsvTitle: "Download the campaigns shown as CSV",
    csvFilename: "adamant-campaigns.csv",
    csvType: "Type",
    csvStatus: "Status",
    csvReason: "Top finding",
    csvScore: "AI score",
    budgetCapped: "Budget-capped",
    budgetCappedTitle:
      "ROAS {roas} above target with {pacing} of budget spent ({budget}/day): a winner held back by its budget",
    colTrend: "Trend",
    trendCost: "Cost",
    trendCtr: "CTR",
    trendCpc: "CPC",
    trendMetricAria: "Choose trend metric",
    sparkAria: "Daily cost of campaign “{name}”: {start} on the first day of the period, {end} on the last day.",
    sparkAriaMetric: "Daily {metric} of campaign “{name}”",
    footerLabel: "Filter total ({n})",
    footerTitle:
      "Aggregate of the currently filtered campaigns: ROAS and PNO are re-derived from sums, not averaged",
    severityPillTitle: "Show the triage findings in the row detail",
    triageHeading: "Why it needs attention",
    csvImpressions: "Impressions",
    csvClicks: "Clicks",
    csvConvRate: "Conv. rate %",
  },
} as const;

/** Per-metric cell colour, driven by the shared triage thresholds so the ROAS /
 *  PNO cells, the row badge and the banner can never disagree. */
const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  good: "text-positive",
  bad: "text-negative",
  neutral: "text-navy-700",
  muted: "text-muted",
};

/** Pill tint per severity (healthy rows render a muted dash instead). */
const SEVERITY_BADGE: Record<Exclude<Severity, "ok">, string> = {
  critical: "bg-negative-soft text-negative",
  warning: "bg-coral-soft text-coral-600",
};

// --- sorting / filtering ----------------------------------------------------
// Sort/filter models + localStorage persistence live in ./table/sort and
// ./table/filters; the SortHeader cell in ./table/SortHeader. This file keeps
// only the render + the view derivation.

/** Sortable columns + the (unsortable) AI-report column — drives empty-state
 *  colspan. The optional trend-sparkline column is added per render (`cols`)
 *  only when per-campaign series data exists. */
const COLS = SORT_KEYS.length + 1;

const FILTER_FIELD =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-700 transition-colors hover:border-navy-200";

export default function CampaignTable({
  campaigns,
  reports,
  staleKeys,
  histories,
  analyzing,
  analyzeErrors,
  cached,
  changesById,
  onAnalyze,
  onRefineReport,
  period,
  fmtMoney,
  campaignSeries,
  typeFilter,
  onTypeFilterChange,
  onPreparePackage,
  goals,
  sources,
}: {
  campaigns: Campaign[];
  reports: Record<string, CampaignReport>;
  /** campaign ids whose stored report predates a data-changing sync (stale) */
  staleKeys?: string[];
  histories: Record<string, ReportHistoryPoint[]>;
  analyzing: Record<string, boolean>;
  analyzeErrors: Record<string, CampaignError>;
  /** per-campaign-id: was the last evaluation served from cache (no new call) */
  cached: Record<string, boolean>;
  /** per-campaign-id diff vs the prior sync, so triage can flag ROAS craters /
   *  spend spikes the current-snapshot rules can't see. Empty until ≥2 syncs. */
  changesById: Record<string, CampaignChange>;
  /** run one evaluation; resolving `false` signals a failure (the batch queue
   *  stops there instead of hammering the rate limiter) */
  onAnalyze: (campaignId: string) => Promise<boolean> | void;
  /** Direction 3: re-run one campaign's evaluation with a free-text steer (RefineBar
   *  in the expanded report). Absent → the report shows no refine affordance. */
  onRefineReport?: (campaignId: string, note: string) => void;
  /** the synced period the rows cover — budget pacing needs the day count */
  period: CampaignPeriod;
  /** currency-aware money formatter (Direction 2): fmt.fmtCZK for a CZK/unknown
   *  account (byte-identical), else the amount labelled in the account's own
   *  currency. Optional so any legacy caller falls back to CZK formatting. */
  fmtMoney?: (n: number) => string;
  /** per-campaign daily series (campaign id → points) — when present, each row
   *  gets a cost sparkline so spend spikes/flatlines are visible at a glance */
  campaignSeries?: Record<string, DailyPoint[]>;
  /** lifted type filter — CampaignsClient owns it so the TypeBreakdown cards
   *  and the table dropdown drive the same state (click a card → filter rows) */
  typeFilter: CampaignType | "all";
  onTypeFilterChange: (t: CampaignType | "all") => void;
  /** Stage a governed change-set for one critical row — prefers that campaign's
   *  alert when one exists, else a campaign-scoped create. Absent for anonymous
   *  visitors (the control-plane route is signed-in only). Resolves { ok, error }
   *  so the row can drop its busy state AND surface the server's failure reason. */
  onPreparePackage?: (campaignId: string) => Promise<{ ok: boolean; error?: string }> | void;
  /** the tenant's triage goal — agreed pnoGoal → target ROAS/PNO, plus the
   *  margin-based break-even when a cost model exists. Threaded through every
   *  triage / tone / banner call so the badges, cell colours and the summary all
   *  measure against the SAME goal. Omitted → the module constants (byte-identical
   *  default). */
  goals?: TriageGoals;
  /** ADR-0010 — the union read's sections, present ONLY when the project resolved
   *  to more than one per-account tenant. Absent (every single-network project) →
   *  no source column, no source filter, byte-identical table. */
  sources?: CampaignsSourceMeta[];
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const errText = useCampaignErrorText();
  const { locale } = useLocale();
  // Currency-aware money label (Direction 2). Defaults to CZK formatting so a caller
  // that doesn't pass it — and every CZK account — is byte-identical to before.
  const money = fmtMoney ?? fmt.fmtCZK;

  // Build translated column definitions after hooks run.
  const SORT_COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "severity", label: t("colPriority"), align: "left" },
    { key: "name", label: t("colCampaign"), align: "left" },
    { key: "cost", label: t("colCost"), align: "right" },
    { key: "conversions", label: t("colConversions"), align: "right" },
    { key: "conversionValue", label: t("colConvValue"), align: "right" },
    { key: "cpa", label: "CPA", align: "right" },
    { key: "roas", label: "ROAS", align: "right" },
    { key: "pno", label: "PNO", align: "right" },
  ];

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<SortState>(loadSort);
  const [query, setQuery] = useState(() => loadFilters().query);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">(() => loadFilters().statusFilter);
  const [attentionOnly, setAttentionOnly] = useState(() => loadFilters().attentionOnly);
  // ADR-0010 — the union's network filter. Deliberately NOT persisted alongside
  // the other filters: a stored "sklik only" would silently hide every row for a
  // project that later drops back to one network.
  const [sourceFilter, setSourceFilter] = useState<SourceFilterValue>("all");
  const unionSources = sources && sources.length > 1 ? sources : null;

  // Persist the chosen sort so the table reopens the way the user left it.
  useEffect(() => {
    saveSort(sort);
  }, [sort]);

  // Persist the filters alongside sort, so a daily reviewer's segment survives a reload.
  useEffect(() => {
    saveFilters({ query, typeFilter, statusFilter, attentionOnly });
  }, [query, typeFilter, statusFilter, attentionOnly]);

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const analyze = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: true }));
    void onAnalyze(id);
  };

  // Which critical row is currently staging a change-set (disables its button),
  // plus the per-row failure text so a failed stage isn't completely silent.
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<Record<string, string>>({});
  const prepare = async (id: string) => {
    if (!onPreparePackage) return;
    setPreparingId(id);
    setPrepareError((e) => {
      const { [id]: _drop, ...rest } = e;
      return rest;
    });
    try {
      const res = await onPreparePackage(id);
      if (res && !res.ok) {
        setPrepareError((e) => ({ ...e, [id]: res.error ?? t("preparePackageFailed") }));
      }
    } finally {
      setPreparingId(null);
    }
  };

  // Which metric the per-row trend sparkline plots. Cost is always available; CTR
  // and CPC only when the widened daily spine (clicks + impressions) reached the
  // stored series — legacy series stay cost-only and never show the toggle.
  const [trendMetric, setTrendMetric] = useState<SeriesMetric>("cost");

  // One-click batch over the existing per-row endpoint: strictly sequential
  // (concurrency 1 respects the AI rate limiter), in triageWeight order — the
  // documented order a PPC manager should spend their evaluation clicks — and
  // stopped by the first failure/429 or a user cancel. Rows that already have a
  // report are skipped; re-evaluation stays a deliberate per-row click. The
  // execution loop + progress state live in useBatchRunner; this file builds the
  // ordered queue (it owns batchPending + the triage weighting).
  const { batch, runBatch, cancelBatch } = useBatchRunner(onAnalyze);
  const runFlaggedBatch = () => {
    const queue = batchPending
      .slice()
      .sort(
        (a, b) =>
          triageWeight(b.c, changesById[b.c.id], goals, campaignSeries?.[b.c.id]) -
          triageWeight(a.c, changesById[a.c.id], goals, campaignSeries?.[a.c.id])
      )
      .map(({ c }) => c.id);
    void runBatch(queue);
  };
  // First click sorts (numeric/severity desc, text asc); clicking the active column flips.
  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );

  const resetFilters = () => {
    setQuery("");
    onTypeFilterChange("all");
    setStatusFilter("all");
    setAttentionOnly(false);
    setSourceFilter("all");
  };

  // Trend column only when per-campaign series exist (older tenants re-sync
  // into it); the column count drives the empty-state / detail-row colspans.
  const allSeries = Object.values(campaignSeries ?? {});
  const hasSeries = allSeries.some((pts) => (pts?.length ?? 0) >= 2);
  const cols = COLS + (hasSeries ? 1 : 0);

  // Metrics the trend toggle can offer: cost always, CTR/CPC only when the spine
  // is present on some series. `activeTrendMetric` guards against a selected
  // metric that the current data can't support (falls back to cost) without a
  // state-reset effect.
  const trendMetrics = (["cost", "ctr", "cpc"] as SeriesMetric[]).filter(
    (m) => m === "cost" || allSeries.some((pts) => seriesSupportsMetric(pts ?? [], m))
  );
  const activeTrendMetric: SeriesMetric = trendMetrics.includes(trendMetric) ? trendMetric : "cost";
  const trendMetricLabel: Record<SeriesMetric, string> = {
    cost: t("trendCost"),
    ctr: t("trendCtr"),
    cpc: t("trendCpc"),
  };

  // The expensive layer — withMetrics + the full triage rule engine per campaign
  // (including the slow-bleed scan over each campaign's daily series) + the
  // portfolio summary — memoised on its REAL data inputs. Typing in the search
  // box (below) mutates only local `query` state, so this memo is preserved and
  // the rule engine never re-runs per keystroke; only the filter layer does.
  const { all, rows: allRows, summary } = useMemo(
    () => deriveCampaignRows(campaigns, changesById, goals, campaignSeries),
    [campaigns, changesById, goals, campaignSeries]
  );

  const q = query.trim().toLowerCase();
  const filtersActive =
    q !== "" || typeFilter !== "all" || statusFilter !== "all" || attentionOnly || sourceFilter !== "all";

  // Flagged rows still lacking a report — the "evaluate all flagged" queue. A
  // cheap filter over the already-triaged rows (and consumed by the earlier
  // `runFlaggedBatch` closure), so it stays a plain derivation — the expensive
  // triage pass it reads from is what's memoised, above.
  const batchPending = allRows.filter(({ c, tr }) => tr.severity !== "ok" && !reports[c.id]);

  // Cheap layers over the already-triaged rows: the filter re-runs on a search
  // keystroke (only `q` changed), the sort only when the sort state changes.
  const filtered = useMemo(
    () => filterCampaignRows(allRows, { query: q, typeFilter, statusFilter, attentionOnly, sourceFilter }),
    [allRows, q, typeFilter, statusFilter, attentionOnly, sourceFilter]
  );
  const view = useMemo(() => sortCampaignRows(filtered, sort), [filtered, sort]);

  // Export the *currently filtered + sorted* view as a cs-CZ-friendly CSV (the
  // deliverable agencies actually hand to clients), carrying triage severity, the
  // top finding, and any loaded AI score. Reads only in-memory state.
  const exportCsv = () => exportCampaignsCsv({ view, reports, t, locale });

  return (
    <div className="card overflow-hidden">
      <TriageBanner
        summary={summary}
        sortedBySeverity={sort.key === "severity"}
        onSortBySeverity={() => setSort({ key: "severity", dir: "desc" })}
        batchPending={batchPending.length}
        batch={batch}
        onEvaluateFlagged={runFlaggedBatch}
        onCancelBatch={cancelBatch}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search
            width={16}
            height={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAriaLabel")}
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-navy-800 transition-colors placeholder:text-muted hover:border-navy-200"
          />
        </div>

        {/* ADR-0010 — one segment per network the project actually reads. Only a
            genuine union renders it (a single-source console is unchanged). */}
        {unionSources && (
          <SourceFilter value={sourceFilter} onChange={setSourceFilter} sources={unionSources} />
        )}

        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value as CampaignType | "all")}
          aria-label={t("filterTypeAriaLabel")}
          className={FILTER_FIELD}
        >
          <option value="all">{t("filterTypeAll")}</option>
          {CAMPAIGN_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {CAMPAIGN_TYPE_LABELS[tp]}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "all")}
          aria-label={t("filterStatusAriaLabel")}
          className={FILTER_FIELD}
        >
          <option value="all">{t("filterStatusAll")}</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {campaignStatusLabel(s, locale)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          aria-pressed={attentionOnly}
          title={t("attentionTitle")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            attentionOnly
              ? "border-coral-400/50 bg-coral-soft text-coral-600"
              : "border-line text-navy-700 hover:border-navy-200"
          }`}
        >
          <TrendDown width={15} height={15} />
          {t("attentionButton")}
          <span
            className={`tnum rounded-full px-1.5 text-xs ${
              attentionOnly ? "bg-coral-600/15" : "bg-navy-50 text-muted"
            }`}
          >
            {summary.attention}
          </span>
        </button>

        <div className="ml-auto flex items-center gap-3">
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-medium text-brand-accent hover:underline"
            >
              {t("clearFilters")}
            </button>
          )}
          {view.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              title={t("exportCsvTitle")}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              <Download width={14} height={14} />
              {t("exportCsv")}
            </button>
          )}
          <span className="tnum whitespace-nowrap text-xs text-muted">
            {filtersActive
              ? t("countFiltered", { shown: view.length, total: all.length })
              : t("countAll", { n: all.length })}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              {SORT_COLUMNS.map((col) => (
                <Fragment key={col.key}>
                  <SortHeader
                    col={col}
                    sort={sort}
                    onSort={onSort}
                    title={t("sortTitle", { col: col.label })}
                  />
                  {col.key === "name" && hasSeries && (
                    <th className="px-3 py-3 text-left font-semibold uppercase tracking-wide">
                      {trendMetrics.length > 1 ? (
                        <span
                          role="group"
                          aria-label={t("trendMetricAria")}
                          className="inline-flex items-center gap-1 normal-case"
                        >
                          {trendMetrics.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setTrendMetric(m)}
                              aria-pressed={activeTrendMetric === m}
                              className={`rounded-pill px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                activeTrendMetric === m
                                  ? "bg-brand-100 text-brand-accent"
                                  : "text-muted hover:text-navy-700"
                              }`}
                            >
                              {trendMetricLabel[m]}
                            </button>
                          ))}
                        </span>
                      ) : (
                        t("colTrend")
                      )}
                    </th>
                  )}
                </Fragment>
              ))}
              <th className="px-5 py-3 text-right font-semibold">{t("colAiReport")}</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={cols} className="px-5 py-12 text-center">
                  <p className="text-sm text-muted">{t("emptyNoMatch")}</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-2 text-sm font-medium text-brand-accent hover:underline"
                  >
                    {t("clearFilters")}
                  </button>
                </td>
              </tr>
            )}
            {view.map(({ c, tr: triageResult }) => {
              const report = reports[c.id];
              const isAnalyzing = Boolean(analyzing[c.id]);
              const err = analyzeErrors[c.id];
              const isOpen = Boolean(expanded[c.id]);
              const needsAttention = triageResult.severity !== "ok";
              // "Winner starved by its budget" — profitable yet pacing at/above
              // its budget; null when the row carries no budget (no mis-flags).
              // When a per-campaign daily series exists, pace against the days the
              // campaign actually spent (partial-window winners stop hiding).
              const pacing = budgetPacing(c, period, activeBudgetDays(campaignSeries?.[c.id], period));
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-line/70 hover:bg-canvas/60">
                    <td className="px-5 py-3 align-top">
                      {triageResult.severity === "ok" ? (
                        <span className="text-muted" title={t("okTitle")} aria-label={t("okLabel")}>
                          —
                        </span>
                      ) : (
                        <div className="flex flex-col items-start gap-1.5">
                          {/* A button, not a bare pill: the hover-only tooltip left
                              touch users with no way to read WHY the row is flagged.
                              Clicking opens the row detail, where the same reasons
                              render as a copyable list; the title stays as a
                              secondary desktop affordance. */}
                          <button
                            type="button"
                            onClick={() => toggle(c.id)}
                            aria-expanded={isOpen}
                            className={`pill cursor-pointer transition-shadow hover:shadow-card ${SEVERITY_BADGE[triageResult.severity]}`}
                            title={`${t("severityPillTitle")}\n${triageResult.reasons.map((r) => `${triageReasonLabel(r, locale)}: ${r.detail}`).join("\n")}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {severityLabel(triageResult.severity, locale)}
                          </button>
                          {/* ADR-0010 — a union READ is not a union WRITE: Sklik
                              rows are read-only until the Sklik write path lands
                              (the control-plane route refuses them anyway), so the
                              row states that instead of offering a button that
                              cannot work. */}
                          {triageResult.severity === "critical" &&
                            onPreparePackage &&
                            c.source === "sklik" && <SourceReadOnlyHint />}
                          {/* Critical rows get a direct path to the fix: stage a
                              governed change-set (scoped to this campaign's alert
                              when one exists) without hunting through the inbox. */}
                          {triageResult.severity === "critical" && onPreparePackage && c.source !== "sklik" && (
                            <>
                              <button
                                type="button"
                                onClick={() => void prepare(c.id)}
                                disabled={preparingId === c.id}
                                title={t("preparePackageTitle")}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-accent transition-colors hover:underline disabled:opacity-60"
                              >
                                <Bolt width={11} height={11} />
                                {preparingId === c.id ? t("preparingPackage") : t("preparePackage")}
                              </button>
                              {prepareError[c.id] && (
                                <span className="text-[11px] text-negative" role="alert">
                                  {prepareError[c.id]}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-navy-800">{c.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {unionSources && <SourceBadge source={c.source} />}
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: CAMPAIGN_TYPE_COLORS[c.type] }}
                            aria-hidden
                          />
                          {CAMPAIGN_TYPE_LABELS[c.type]}
                        </span>
                        <span
                          className={`pill ${
                            c.status === "enabled" ? "bg-positive-soft text-positive" : "bg-navy-50 text-muted"
                          }`}
                        >
                          {campaignStatusLabel(c.status, locale)}
                        </span>
                        {pacing?.capped && (
                          <span
                            className="pill bg-coral-soft text-coral-600"
                            title={t("budgetCappedTitle", {
                              roas: fmt.fmtMultiple(c.roas),
                              pacing: fmt.fmtPct(pacing.pacing, 0),
                              budget: money(c.budgetPerDay ?? 0),
                            })}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {t("budgetCapped")}
                          </span>
                        )}
                      </div>
                    </td>
                    {hasSeries && (
                      <td className="px-3 py-3 align-middle">
                        {(() => {
                          const pts = campaignSeries?.[c.id] ?? [];
                          const values = dailyMetricValues(pts, activeTrendMetric);
                          if (values.length < 2) return <span className="text-muted">—</span>;
                          // Cost keeps its exact prior aria (with CZK endpoints); CTR/CPC
                          // use a metric-named aria — same Sparkline, autoscaled.
                          const label =
                            activeTrendMetric === "cost"
                              ? t("sparkAria", {
                                  name: c.name,
                                  start: fmt.fmtCZKCompact(values[0]!),
                                  end: fmt.fmtCZKCompact(values[values.length - 1]!),
                                })
                              : t("sparkAriaMetric", {
                                  name: c.name,
                                  metric: trendMetricLabel[activeTrendMetric],
                                });
                          return (
                            <Sparkline
                              values={values}
                              width={96}
                              height={26}
                              area={false}
                              className="h-[26px] w-24"
                              label={label}
                            />
                          );
                        })()}
                      </td>
                    )}
                    <td className="tnum px-3 py-3 text-right text-navy-700">{money(c.cost)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">{fmt.fmtInt(c.conversions)}</td>
                    <td className="tnum px-3 py-3 text-right font-medium text-navy-800">{money(c.conversionValue)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">
                      {c.conversions > 0 ? money(c.cpa) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[roasMetricTone(c.roas, goals?.targetRoas)]}`}>
                      {c.roas > 0 ? fmt.fmtMultiple(c.roas) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[pnoMetricTone(c.pno, goals?.targetPno)]}`}>
                      {c.pno > 0 ? fmt.fmtPct(c.pno) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {report ? (
                        <button
                          type="button"
                          onClick={() => toggle(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                          aria-expanded={isOpen}
                        >
                          <span className="tnum font-semibold text-brand-accent">{report.result.score}</span>
                          {isOpen ? t("reportHide") : t("reportShow")}
                          <ChevronDown
                            width={14}
                            height={14}
                            className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
                          />
                        </button>
                      ) : (
                        <PillButton
                          size="compact"
                          press
                          onClick={() => analyze(c.id)}
                          disabled={isAnalyzing}
                          title={needsAttention ? t("analyzePriorityTitle") : undefined}
                        >
                          {isAnalyzing ? (
                            <>
                              <Gauge width={14} height={14} className="animate-pulse" />
                              {t("analyzing")}
                            </>
                          ) : (
                            <>
                              <Bolt width={14} height={14} />
                              {t("analyze")}
                            </>
                          )}
                        </PillButton>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-line/70 bg-canvas/40">
                      <td colSpan={cols} className="px-5 py-5">
                        {/* Deterministic triage findings, inline and copyable —
                            the same reasons the pill tooltip shows, finally
                            reachable on touch devices. Above the AI block, so
                            "why is this red?" never depends on a paid report. */}
                        {triageResult.reasons.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                              {t("triageHeading")}
                            </h4>
                            <ul className="mt-2 space-y-1.5">
                              {triageResult.reasons.map((r) => (
                                <li key={r.id} className="flex items-start gap-2 text-sm">
                                  <span
                                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                                      r.severity === "critical" ? "bg-negative" : "bg-coral-500"
                                    }`}
                                    aria-hidden
                                  />
                                  <span className="text-navy-700">
                                    <span className="font-semibold text-navy-800">
                                      {triageReasonLabel(r, locale)}
                                    </span>
                                    {": "}
                                    {r.detail}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {/* The funnel layer under the money metrics — the same
                            CTR/CR/CPC evidence the AI prompt reasons from, so the
                            human and the model look at identical numbers. */}
                        <RowFunnel c={c} pacing={pacing} money={money} />
                        {isAnalyzing && !report ? (
                          <div className="flex items-center gap-3 text-sm text-muted">
                            <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
                            {t("evaluatingCampaign", { name: c.name })}
                          </div>
                        ) : err ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-negative">{errText(err)}</p>
                            <button
                              type="button"
                              onClick={() => analyze(c.id)}
                              className="rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 hover:border-brand-300"
                            >
                              {t("retryButton")}
                            </button>
                          </div>
                        ) : report ? (
                          <div className="animate-fade-up">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                                <Sparkles width={16} height={16} className="text-brand-600" />
                                {t("evalHeading", { name: c.name })}
                              </h3>
                              <button
                                type="button"
                                onClick={() => analyze(c.id)}
                                disabled={isAnalyzing}
                                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                              >
                                <Bolt width={13} height={13} />
                                {isAnalyzing ? t("analyzing") : t("reanalyze")}
                              </button>
                            </div>
                            <ReportView
                              report={report}
                              history={histories[c.id]}
                              cached={cached[c.id]}
                              stale={staleKeys?.includes(c.id)}
                              onRefine={onRefineReport ? (note) => onRefineReport(c.id, note) : undefined}
                              refining={isAnalyzing}
                            />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {/* Filtered-segment totals: the number the user filtered FOR. Rendered
              only when a filter narrows the view — the unfiltered portfolio
              aggregate already lives in the KPI cards above. `aggregate`
              re-derives ROAS/PNO from the segment's sums, so the footer can
              never drift from the body rows' math. */}
          {filtersActive && view.length > 0 && (
            <tfoot>
              {(() => {
                const seg = aggregate(view.map((v) => v.c));
                return (
                  <tr className="border-t-2 border-line bg-canvas/60 font-medium" title={t("footerTitle")}>
                    <td colSpan={2 + (hasSeries ? 1 : 0)} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
                      Σ {t("footerLabel", { n: seg.count })}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-navy-800">{money(seg.cost)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-800">{fmt.fmtInt(seg.conversions)}</td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-navy-800">
                      {money(seg.conversionValue)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-navy-800">
                      {seg.conversions > 0 ? money(seg.cpa) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-semibold ${METRIC_TONE_CLASS[roasMetricTone(seg.roas, goals?.targetRoas)]}`}>
                      {seg.roas > 0 ? fmt.fmtMultiple(seg.roas) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-semibold ${METRIC_TONE_CLASS[pnoMetricTone(seg.pno, goals?.targetPno)]}`}>
                      {seg.pno > 0 ? fmt.fmtPct(seg.pno) : "—"}
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                );
              })()}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
