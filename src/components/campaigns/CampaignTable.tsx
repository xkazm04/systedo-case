"use client";

import { Fragment, useEffect, useState } from "react";
import { Bolt, ChevronDown, Gauge, Search, Sparkles, TrendDown } from "@/components/icons";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPE_COLORS,
  CAMPAIGN_TYPE_LABELS,
  CAMPAIGN_TYPES,
  withMetrics,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
} from "@/lib/campaigns/types";
import {
  SEVERITY_LABELS,
  SEVERITY_RANK,
  pnoMetricTone,
  roasMetricTone,
  summarize,
  triage,
  type MetricTone,
  type Severity,
} from "@/lib/campaigns/triage";
import type { CampaignReport, ReportHistoryPoint } from "@/lib/ai-types";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import ReportView from "./ReportView";
import TriageBanner from "./TriageBanner";

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

/** Columns the user can sort by, in render order. The AI-report column is not
 *  sortable. `name` sorts text (Czech collation), `severity` by triage rank then
 *  spend; everything else is numeric. */
const SORT_COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "severity", label: "Priorita", align: "left" },
  { key: "name", label: "Kampaň", align: "left" },
  { key: "cost", label: "Náklady", align: "right" },
  { key: "conversions", label: "Konverze", align: "right" },
  { key: "conversionValue", label: "Hodnota konv.", align: "right" },
  { key: "cpa", label: "CPA", align: "right" },
  { key: "roas", label: "ROAS", align: "right" },
  { key: "pno", label: "PNO", align: "right" },
];
const SORT_KEYS = SORT_COLUMNS.map((c) => c.key);
/** Sortable columns + the (unsortable) AI-report column — drives empty-state colspan. */
const COLS = SORT_COLUMNS.length + 1;

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

function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: { key: SortKey; label: string; align: "left" | "right" };
  sort: SortState;
  onSort: (key: SortKey) => void;
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
        title={`Seřadit podle „${col.label}“`}
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
  histories,
  analyzing,
  analyzeErrors,
  onAnalyze,
}: {
  campaigns: Campaign[];
  reports: Record<string, CampaignReport>;
  histories: Record<string, ReportHistoryPoint[]>;
  analyzing: Record<string, boolean>;
  analyzeErrors: Record<string, string>;
  onAnalyze: (campaignId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<SortState>(loadSort);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CampaignType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [attentionOnly, setAttentionOnly] = useState(false);

  // Persist the chosen sort so the table reopens the way the user left it.
  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
    } catch {
      /* storage may be unavailable (e.g. private mode) — non-fatal */
    }
  }, [sort]);

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
  const summary = summarize(all); // portfolio-wide — independent of the active filters
  const q = query.trim().toLowerCase();
  const filtersActive =
    q !== "" || typeFilter !== "all" || statusFilter !== "all" || attentionOnly;

  // Each row carries its triage result so the badge, the filter and the sort all
  // read the same classification.
  const view = all
    .map((c) => ({ c, t: triage(c) }))
    .filter(({ c, t }) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (attentionOnly && t.severity === "ok") return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  view.sort((a, b) => {
    let cmp: number;
    if (sort.key === "severity") {
      cmp = SEVERITY_RANK[a.t.severity] - SEVERITY_RANK[b.t.severity];
      if (cmp === 0) cmp = a.c.cost - b.c.cost; // tie-break: bigger spend first
    } else if (sort.key === "name") {
      cmp = a.c.name.localeCompare(b.c.name, "cs");
    } else {
      cmp = a.c[sort.key] - b.c[sort.key];
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });

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
            placeholder="Hledat kampaň…"
            aria-label="Hledat kampaň podle názvu"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-navy-800 transition-colors placeholder:text-muted hover:border-navy-200"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CampaignType | "all")}
          aria-label="Filtrovat podle typu kampaně"
          className={FILTER_FIELD}
        >
          <option value="all">Všechny typy</option>
          {CAMPAIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {CAMPAIGN_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CampaignStatus | "all")}
          aria-label="Filtrovat podle stavu kampaně"
          className={FILTER_FIELD}
        >
          <option value="all">Všechny stavy</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CAMPAIGN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          aria-pressed={attentionOnly}
          title="Zobrazit jen kampaně, které porušují některé z pravidel triáže"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            attentionOnly
              ? "border-coral-400/50 bg-coral-soft text-coral-600"
              : "border-line text-navy-700 hover:border-navy-200"
          }`}
        >
          <TrendDown width={15} height={15} />
          Vyžaduje pozornost
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
              Zrušit filtry
            </button>
          )}
          <span className="tnum whitespace-nowrap text-xs text-muted">
            {filtersActive ? `${view.length} z ${all.length}` : `${all.length} kampaní`}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              {SORT_COLUMNS.map((col) => (
                <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
              ))}
              <th className="px-5 py-3 text-right font-semibold">AI report</th>
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={COLS} className="px-5 py-12 text-center">
                  <p className="text-sm text-muted">Žádná kampaň neodpovídá zadanému filtru.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-2 text-sm font-medium text-brand-accent hover:underline"
                  >
                    Zrušit filtry
                  </button>
                </td>
              </tr>
            )}
            {view.map(({ c, t }) => {
              const report = reports[c.id];
              const isAnalyzing = Boolean(analyzing[c.id]);
              const err = analyzeErrors[c.id];
              const isOpen = Boolean(expanded[c.id]);
              const needsAttention = t.severity !== "ok";
              return (
                <Fragment key={c.id}>
                  <tr className="border-b border-line/70 hover:bg-canvas/60">
                    <td className="px-5 py-3 align-top">
                      {t.severity === "ok" ? (
                        <span className="text-muted" title="Plní cíl" aria-label="V pořádku">
                          —
                        </span>
                      ) : (
                        <span
                          className={`pill ${SEVERITY_BADGE[t.severity]}`}
                          title={t.reasons.map((r) => `${r.label}: ${r.detail}`).join("\n")}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          {SEVERITY_LABELS[t.severity]}
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
                          {CAMPAIGN_STATUS_LABELS[c.status]}
                        </span>
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">{fmtCZK(c.cost)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">{fmtInt(c.conversions)}</td>
                    <td className="tnum px-3 py-3 text-right font-medium text-navy-800">{fmtCZK(c.conversionValue)}</td>
                    <td className="tnum px-3 py-3 text-right text-navy-700">
                      {c.conversions > 0 ? fmtCZK(c.cpa) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[roasMetricTone(c.roas)]}`}>
                      {c.roas > 0 ? fmtMultiple(c.roas) : "—"}
                    </td>
                    <td className={`tnum px-3 py-3 text-right font-medium ${METRIC_TONE_CLASS[pnoMetricTone(c.pno)]}`}>
                      {c.pno > 0 ? fmtPct(c.pno) : "—"}
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
                          {isOpen ? "skrýt" : "report"}
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
                          title={needsAttention ? "Doporučeno vyhodnotit prioritně" : undefined}
                          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isAnalyzing ? (
                            <>
                              <Gauge width={14} height={14} className="animate-pulse" />
                              Analyzuji…
                            </>
                          ) : (
                            <>
                              <Bolt width={14} height={14} />
                              Analyzovat
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
                            Vyhodnocuji kampaň „{c.name}“…
                          </div>
                        ) : err ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-sm text-negative">{err}</p>
                            <button
                              type="button"
                              onClick={() => analyze(c.id)}
                              className="rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 hover:border-brand-300"
                            >
                              Zkusit znovu
                            </button>
                          </div>
                        ) : report ? (
                          <div className="animate-fade-up">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                                <Sparkles width={16} height={16} className="text-brand-600" />
                                AI vyhodnocení — {c.name}
                              </h3>
                              <button
                                type="button"
                                onClick={() => analyze(c.id)}
                                disabled={isAnalyzing}
                                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                              >
                                <Bolt width={13} height={13} />
                                {isAnalyzing ? "Analyzuji…" : "Přeanalyzovat"}
                              </button>
                            </div>
                            <ReportView report={report} history={histories[c.id]} />
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
