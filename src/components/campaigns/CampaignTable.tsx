"use client";

import { Fragment, useEffect, useState } from "react";
import { Bolt, ChevronDown, Download, Gauge, Search, Sparkles, TrendDown } from "@/components/icons";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  campaignStatusLabel,
  withMetrics,
  type Campaign,
  type CampaignChange,
  type CampaignStatus,
  type CampaignType,
} from "@/lib/campaigns/types";
import {
  SEVERITY_RANK,
  pnoMetricTone,
  roasMetricTone,
  severityLabel,
  triageReasonLabel,
  summarize,
  triage,
  type MetricTone,
  type Severity,
} from "@/lib/campaigns/triage";
import type { CampaignReport, ReportHistoryPoint } from "@/lib/ai-types";
import { toCsv, downloadText } from "@/lib/export";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import ReportView from "./ReportView";
import TriageBanner from "./TriageBanner";

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
    analyzePriorityTitle: "Doporučeno vyhodnotit prioritně",
    analyzing: "Analyzuji…",
    analyze: "Analyzovat",
    evaluatingCampaign: "Vyhodnocuji kampaň „{name}“…",
    retryButton: "Zkusit znovu",
    evalHeading: "AI vyhodnocení — {name}",
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
    exportCsv: "Export CSV",
    exportCsvTitle: "Stáhnout zobrazené kampaně jako CSV",
    csvType: "Typ",
    csvStatus: "Stav",
    csvReason: "Hlavní nález",
    csvScore: "AI skóre",
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
    analyzePriorityTitle: "Recommended to evaluate first",
    analyzing: "Analysing…",
    analyze: "Analyse",
    evaluatingCampaign: "Evaluating campaign “{name}”…",
    retryButton: "Retry",
    evalHeading: "AI evaluation — {name}",
    reanalyze: "Re-analyse",
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
    exportCsvTitle: "Download the shown campaigns as CSV",
    csvType: "Type",
    csvStatus: "Status",
    csvReason: "Top finding",
    csvScore: "AI score",
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

type SortKey =
  | "severity"
  | "name"
  | "cost"
  | "conversions"
  | "conversionValue"
  | "cpa"
  | "roas"
  | "pno";
type SortDir = "asc" | "desc";
interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** SortKey array used for validation when restoring sort from localStorage. */
const SORT_KEYS: SortKey[] = ["severity", "name", "cost", "conversions", "conversionValue", "cpa", "roas", "pno"];
/** Sortable columns + the (unsortable) AI-report column — drives empty-state colspan. */
/** Sortable columns + the (unsortable) AI-report column — drives empty-state colspan. */
const COLS = SORT_KEYS.length + 1;

const SORT_STORAGE_KEY = "campaigns.table.sort";
/** Persisted default: highest spend first — the lens a PPC manager reaches for. */
const DEFAULT_SORT: SortState = { key: "cost", dir: "desc" };

function loadSort(): SortState {
  if (typeof window === "undefined") return DEFAULT_SORT;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const p = JSON.parse(raw) as Partial<SortState>;
    if (p && SORT_KEYS.includes(p.key as SortKey) && (p.dir === "asc" || p.dir === "desc")) {
      return { key: p.key as SortKey, dir: p.dir };
    }
  } catch {
    /* corrupt or unavailable storage — fall back to the default */
  }
  return DEFAULT_SORT;
}

const FILTERS_STORAGE_KEY = "campaigns.table.filters";
interface StoredFilters {
  query: string;
  typeFilter: CampaignType | "all";
  statusFilter: CampaignStatus | "all";
  attentionOnly: boolean;
}
const DEFAULT_FILTERS: StoredFilters = {
  query: "",
  typeFilter: "all",
  statusFilter: "all",
  attentionOnly: false,
};

/** Restore the table filters the same way sort is restored, so an agency reviewing
 *  the same segment daily doesn't re-apply them on every visit. Each field is
 *  validated against the known values before use. */
function loadFilters(): StoredFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw) as Partial<StoredFilters>;
    return {
      query: typeof p.query === "string" ? p.query : "",
      typeFilter:
        p.typeFilter === "all" || (CAMPAIGN_TYPES as readonly string[]).includes(p.typeFilter as string)
          ? (p.typeFilter as CampaignType | "all")
          : "all",
      statusFilter:
        p.statusFilter === "all" ||
        (CAMPAIGN_STATUSES as readonly string[]).includes(p.statusFilter as string)
          ? (p.statusFilter as CampaignStatus | "all")
          : "all",
      attentionOnly: typeof p.attentionOnly === "boolean" ? p.attentionOnly : false,
    };
  } catch {
    /* corrupt or unavailable storage — fall back to the defaults */
  }
  return DEFAULT_FILTERS;
}

type TFnType = ReturnType<typeof useT<keyof typeof T.cs>>;

function SortHeader({
  col,
  sort,
  onSort,
  t,
}: {
  col: { key: SortKey; label: string; align: "left" | "right" };
  sort: SortState;
  onSort: (key: SortKey) => void;
  t: TFnType;
}) {
  const active = sort.key === col.key;
  const right = col.align === "right";
  return (
    <th
      className={`${right ? "px-3 text-right" : "px-5 text-left"} py-3 font-semibold`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        title={t("sortTitle", { col: col.label })}
        className={`group -my-1 inline-flex items-center gap-1 py-1 uppercase tracking-wide transition-colors hover:text-navy-700 ${
          right ? "flex-row-reverse" : ""
        } ${active ? "text-navy-700" : ""}`}
      >
        {col.label}
        <ChevronDown
          width={13}
          height={13}
          aria-hidden
          className={`shrink-0 transition-[transform,opacity] ${
            active ? "text-brand-accent opacity-100" : "opacity-0 group-hover:opacity-50"
          } ${active && sort.dir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>
  );
}

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
}: {
  campaigns: Campaign[];
  reports: Record<string, CampaignReport>;
  /** campaign ids whose stored report predates a data-changing sync (stale) */
  staleKeys?: string[];
  histories: Record<string, ReportHistoryPoint[]>;
  analyzing: Record<string, boolean>;
  analyzeErrors: Record<string, string>;
  /** per-campaign-id: was the last evaluation served from cache (no new call) */
  cached: Record<string, boolean>;
  /** per-campaign-id diff vs the prior sync, so triage can flag ROAS craters /
   *  spend spikes the current-snapshot rules can't see. Empty until ≥2 syncs. */
  changesById: Record<string, CampaignChange>;
  onAnalyze: (campaignId: string) => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

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
  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">(() => loadFilters().typeFilter);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">(() => loadFilters().statusFilter);
  const [attentionOnly, setAttentionOnly] = useState(() => loadFilters().attentionOnly);

  // Persist the chosen sort so the table reopens the way the user left it.
  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {
      /* storage may be unavailable (e.g. private mode) — non-fatal */
    }
  }, [sort]);

  // Persist the filters alongside sort, so a daily reviewer's segment survives a reload.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({ query, typeFilter, statusFilter, attentionOnly })
      );
    } catch {
      /* storage may be unavailable (e.g. private mode) — non-fatal */
    }
  }, [query, typeFilter, statusFilter, attentionOnly]);

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  const analyze = (id: string) => {
    setExpanded((e) => ({ ...e, [id]: true }));
    onAnalyze(id);
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
    setTypeFilter("all");
    setStatusFilter("all");
    setAttentionOnly(false);
  };

  // Derive once, then filter + sort. The helpers are pure and Next's React
  // Compiler memoizes the component, so we compute the view directly.
  const all = campaigns.map(withMetrics);
  const summary = summarize(all, changesById); // portfolio-wide — independent of the active filters
  const q = query.trim().toLowerCase();
  const filtersActive =
    q !== "" || typeFilter !== "all" || statusFilter !== "all" || attentionOnly;

  // Each row carries its triage result so the badge, the filter and the sort all
  // read the same classification.
  const view = all
    .map((c) => ({ c, tr: triage(c, changesById[c.id]) }))
    .filter(({ c, tr }) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (attentionOnly && tr.severity === "ok") return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  view.sort((a, b) => {
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

  // Export the *currently filtered + sorted* view as a cs-CZ-friendly CSV (the
  // deliverable agencies actually hand to clients), carrying triage severity, the
  // top finding, and any loaded AI score. Reads only in-memory state.
  const exportCsv = () => {
    const headers = [
      t("colCampaign"), t("csvType"), t("csvStatus"), t("colCost"),
      t("colConversions"), t("colConvValue"), "ROAS", "PNO %",
      t("colPriority"), t("csvReason"), t("csvScore"),
    ];
    const rows = view.map(({ c, tr }) => [
      c.name,
      CAMPAIGN_TYPE_LABELS[c.type],
      campaignStatusLabel(c.status, locale),
      Math.round(c.cost),
      Math.round(c.conversions),
      Math.round(c.conversionValue),
      c.roas > 0 ? Number(c.roas.toFixed(2)) : "",
      c.pno > 0 ? Number((c.pno * 100).toFixed(1)) : "",
      severityLabel(tr.severity, locale),
      tr.primary ? triageReasonLabel(tr.primary, locale) : "",
      reports[c.id]?.result.score ?? "",
    ]);
    downloadText("systedo-kampane.csv", toCsv(headers, rows));
  };

  return (
    <div className="card overflow-hidden">
      <TriageBanner
        summary={summary}
        sortedBySeverity={sort.key === "severity"}
        onSortBySeverity={() => setSort({ key: "severity", dir: "desc" })}
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

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CampaignType | "all")}
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
                <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} t={t} />
              ))}
              <th className="px-5 py-3 text-right font-semibold">{t("colAiReport")}</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={COLS} className="px-5 py-12 text-center">
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
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-line/70 hover:bg-canvas/60">
                    <td className="px-5 py-3 align-top">
                      {triageResult.severity === "ok" ? (
                        <span className="text-muted" title={t("okTitle")} aria-label={t("okLabel")}>
                          —
                        </span>
                      ) : (
                        <span
                          className={`pill ${SEVERITY_BADGE[triageResult.severity]}`}
                          title={triageResult.reasons.map((r) => `${triageReasonLabel(r, locale)}: ${r.detail}`).join("\n")}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          {severityLabel(triageResult.severity, locale)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-navy-800">{c.name}</div>
                      <div className="mt-1 flex items-center gap-2">
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
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">{fmt.fmtCZK(c.cost)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">{fmt.fmtInt(c.conversions)}</td>
                    <td className="tnum px-3 py-3 text-right font-medium text-navy-800">{fmt.fmtCZK(c.conversionValue)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">
                      {c.conversions > 0 ? fmt.fmtCZK(c.cpa) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[roasMetricTone(c.roas)]}`}>
                      {c.roas > 0 ? fmt.fmtMultiple(c.roas) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[pnoMetricTone(c.pno)]}`}>
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
                        <button
                          type="button"
                          onClick={() => analyze(c.id)}
                          disabled={isAnalyzing}
                          title={needsAttention ? t("analyzePriorityTitle") : undefined}
                          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
                        </button>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-b border-line/70 bg-canvas/40">
                      <td colSpan={COLS} className="px-5 py-5">
                        {isAnalyzing && !report ? (
                          <div className="flex items-center gap-3 text-sm text-muted">
                            <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
                            {t("evaluatingCampaign", { name: c.name })}
                          </div>
                        ) : err ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-negative">{err}</p>
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
        </table>
      </div>
    </div>
  );
}
