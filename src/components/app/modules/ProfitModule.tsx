"use client";

import { useEffect, useMemo, useState } from "react";
import { Bulb, Layers, TrendUp, TrendDown } from "@/components/icons";
import { Pill } from "@/components/ui";
import Sparkline from "@/components/charts/Sparkline";
import NextSteps from "@/components/app/NextSteps";
import type { ChannelRow } from "@/lib/metrics";
import type { ChannelShare } from "@/lib/types";
import { computeProfit, reallocateBudget } from "@/lib/profit/compute";
import { applyOverhead } from "@/lib/profit/overhead";
import { computeProductProfit, lowestPoasCategory } from "@/lib/profit/products";
import { retargetTrend, trendDelta } from "@/lib/profit/trend";
import type {
  ChannelMargin,
  MarginScenario,
  OverheadOptions,
  ProductCategory,
  ProfitSummary,
  ProfitTrendPoint,
  ReallocStrategy,
} from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    days30: "30 dní",
    days90: "90 dní",
    months12: "12 měsíců",
    byChannels: "Podle kanálů",
    byProducts: "Podle produktů",
    resetMargins: "Obnovit výchozí marže",
    realNumbersTitle: "Vaše reálná čísla (za zvolené období)",
    realNumbersDesc: "Zadejte skutečný obrat a útratu za reklamu za {period} — tabulka, souhrn i přerozdělení se přepočítají na vaši realitu (kanálový mix zůstává). Ne jen marže.",
    revenue: "Obrat",
    adSpend: "Útrata za reklamu",
    backToDemo: "Zpět na ukázku",
    recalculated: "Přepočítáno na vaše čísla. (Graf vývoje níže ukazuje tvar v čase.)",
    netAdProfit: "Čistý zisk z reklamy",
    grossProfitSub: "hrubý zisk {gross} − náklady {cost}",
    poasSub: "zisk na korunu reklamy · ROAS {roas}",
    blendedMargin: "Blended marže",
    weightedByRevenue: "vážená obratem",
    unprofitableChannels: "Ztrátové kanály",
    unprofitableAfterMargin: "prodělávají po marži",
    trendTitle: "Vývoj zisku a POAS v čase",
    netProfit: "Čistý zisk",
    poas: "POAS",
    lastPeriod: "poslední {granularity} {value}",
    unprofitableWarning_one: "kanál vypadá podle ROAS dobře, ale po započtení marže prodělává — jeho ROAS je pod bodem zvratu (1 / marže). Zvažte přesun rozpočtu do ziskových kanálů.",
    unprofitableWarning_other: "kanály/ů vypadají podle ROAS dobře, ale po započtení marže prodělávají — jejich ROAS je pod bodem zvratu (1 / marže). Zvažte přesun rozpočtu do ziskových kanálů.",
    colChannel: "Kanál",
    colRevenue: "Obrat",
    colCost: "Náklady",
    colRoas: "ROAS",
    colMargin: "Marže",
    colBreakeven: "Bod zvratu",
    colPoas: "POAS",
    colNetProfit: "Čistý zisk",
    marginAriaLabel: "Marže {channel}",
    legendProfitable: "Ziskový",
    legendProfitableDesc: "ROAS ≥ bod zvratu",
    legendUnprofitable: "Ztrátový",
    legendUnprofitableDesc: "ROAS pod bodem zvratu (1 / marže)",
    legendEditHint: "Marže upravte v tabulce — vše se přepočítá živě.",
    overheadTitle: "Zahrnout režijní náklady",
    overheadDesc: "Rozpočítá fixní režii podle obratu a odečte fulfillment na objednávku → skutečný příspěvkový POAS.",
    overheadInclude: "Zahrnout",
    overheadFixedMonthly: "Fixní režie / měsíc",
    overheadMonthsMult: "× {months} měsíce období",
    overheadPerOrder: "Náklad / objednávku",
    overheadFulfillmentHint: "fulfillment, balné, doprava",
    contributionPoas: "Příspěvkový POAS",
    rawPoas: "surový POAS {value}",
    colRawPoas: "Surový POAS",
    colOverhead: "Režie",
    colFulfillment: "Fulfillment",
    colContributionPoas: "Příspěvkový POAS",
    colAdjBreakeven: "Upravený bod zvratu",
    colContribution: "Příspěvek",
    overheadFooter: "Režie {overhead} + fulfillment {fulfillment} rozpočítáno · ztrátových po režii",
    scenariosTitle: "Scénáře marží",
    scenariosDesc: "Uložte si sadu marží pod názvem a porovnejte dva scénáře vedle sebe.",
    scenarioName: "Název scénáře",
    scenarioPlaceholder: "např. Konzervativní marže",
    saveMargins: "Uložit aktuální marže",
    loadScenario: "Načíst scénář",
    loadScenarioSelect: "Vyberte…",
    compareWith: "Porovnat s",
    compareNone: "Žádný",
    scenarioDefaultName: "Scénář {n}",
    deleteScenario: "Smazat scénář {name}",
    colMetric: "Metrika",
    colCurrentMargin: "Aktuální marže",
    colDiff: "Rozdíl",
    rowNetProfit: "Čistý zisk",
    rowUnprofitableChannels: "Ztrátové kanály",
    whatIfTitle: "Co kdyby: přerozdělení rozpočtu",
    whatIfDesc: "Drží ROAS každého kanálu a přesouvá rozpočet do nejziskovějších kanálů.",
    maxProfit: "Maximalizovat zisk",
    holdRevenue: "Udržet obrat",
    totalBudget: "Celkový rozpočet",
    currentBudgetBtn: "Aktuální",
    currentCostHint: "výchozí = dnešní náklady {cost}",
    projectedNetProfit: "Projektovaný čistý zisk",
    todayValue: "dnes {value}",
    profitChange: "Změna zisku",
    revenueSub: "obrat {projected} vs {current}",
    colToday: "Dnes",
    colProposal: "Návrh",
    colChange: "Změna",
    colProfitPerUnit: "Zisk / Kč",
    colProjProfit: "Projekt. zisk",
    reallocationFooter: "Rozděleno {allocated} z {total} · strop 3× dnešní útraty kanálu.",
    liveHint: "Změna marže nebo rozpočtu se promítne živě.",
    categoryWorstAlert: "Kategorie {category} má nejnižší POAS {poas} — při marži {margin} a podílu {share} obratu prodělává. Zvažte vyšší prodejní cenu nebo přesun reklamního rozpočtu jinam.",
    netProfitProducts: "Čistý zisk (produkty)",
    marginVsCogs: "marže z prodejní ceny vs cena zboží",
    poasProducts: "POAS (produkty)",
    blendedMarginSub: "blended marže {value}",
    unprofitableCategories: "Ztrátové kategorie",
    belowBreakeven: "POAS pod bodem zvratu",
    colCategory: "Kategorie",
    colRevenueShare: "Podíl obratu",
    colProductMargin: "Marže",
    productTableFooter: "Marže = 1 − cena zboží (COGS). Reklamní náklady rozpočítány podle podílu na obratu.",
    nextStepLabel: "Přesunout rozpočet",
    nextStepHintHelps: "Přerozdělení slibuje +{profit} zisku",
    nextStepHintOther: "Omezit ztrátové kanály v Kampaních",
    byWeeks: "po týdnech",
    byMonths: "po měsících",
    week: "týden",
    month: "měsíc",
    currencyUnit: "Kč",
  },
  en: {
    days30: "30 days",
    days90: "90 days",
    months12: "12 months",
    byChannels: "By channel",
    byProducts: "By product",
    resetMargins: "Reset margins",
    realNumbersTitle: "Your actual numbers (for selected period)",
    realNumbersDesc: "Enter your real revenue and ad spend for {period} — the table, summary and reallocation will recalculate against your books (channel mix is preserved). Not just margin.",
    revenue: "Revenue",
    adSpend: "Ad spend",
    backToDemo: "Back to demo",
    recalculated: "Recalculated against your numbers. (The trend chart below shows the shape over time.)",
    netAdProfit: "Net ad profit",
    grossProfitSub: "gross profit {gross} − cost {cost}",
    poasSub: "profit per ad currency · ROAS {roas}",
    blendedMargin: "Blended margin",
    weightedByRevenue: "revenue-weighted",
    unprofitableChannels: "Unprofitable channels",
    unprofitableAfterMargin: "losing money after margin",
    trendTitle: "Profit and POAS trend over time",
    netProfit: "Net profit",
    poas: "POAS",
    lastPeriod: "last {granularity} {value}",
    unprofitableWarning_one: "channel looks fine on ROAS but loses money after margin — its ROAS is below break-even (1 / margin). Consider shifting budget to profitable channels.",
    unprofitableWarning_other: "channels look fine on ROAS but lose money after margin — their ROAS is below break-even (1 / margin). Consider shifting budget to profitable channels.",
    colChannel: "Channel",
    colRevenue: "Revenue",
    colCost: "Cost",
    colRoas: "ROAS",
    colMargin: "Margin",
    colBreakeven: "Break-even",
    colPoas: "POAS",
    colNetProfit: "Net profit",
    marginAriaLabel: "Margin {channel}",
    legendProfitable: "Profitable",
    legendProfitableDesc: "ROAS ≥ break-even",
    legendUnprofitable: "Unprofitable",
    legendUnprofitableDesc: "ROAS below break-even (1 / margin)",
    legendEditHint: "Edit margins in the table — everything recalculates live.",
    overheadTitle: "Include overhead costs",
    overheadDesc: "Allocates fixed overhead by revenue share and deducts fulfilment per order → true contribution POAS.",
    overheadInclude: "Include",
    overheadFixedMonthly: "Fixed overhead / month",
    overheadMonthsMult: "× {months} months in period",
    overheadPerOrder: "Cost / order",
    overheadFulfillmentHint: "fulfilment, packaging, shipping",
    contributionPoas: "Contribution POAS",
    rawPoas: "raw POAS {value}",
    colRawPoas: "Raw POAS",
    colOverhead: "Overhead",
    colFulfillment: "Fulfilment",
    colContributionPoas: "Contribution POAS",
    colAdjBreakeven: "Adjusted break-even",
    colContribution: "Contribution",
    overheadFooter: "Overhead {overhead} + fulfilment {fulfillment} allocated · unprofitable after overhead",
    scenariosTitle: "Margin scenarios",
    scenariosDesc: "Save a margin set under a name and compare two scenarios side by side.",
    scenarioName: "Scenario name",
    scenarioPlaceholder: "e.g. Conservative margins",
    saveMargins: "Save current margins",
    loadScenario: "Load scenario",
    loadScenarioSelect: "Select…",
    compareWith: "Compare with",
    compareNone: "None",
    scenarioDefaultName: "Scenario {n}",
    deleteScenario: "Delete scenario {name}",
    colMetric: "Metric",
    colCurrentMargin: "Current margins",
    colDiff: "Difference",
    rowNetProfit: "Net profit",
    rowUnprofitableChannels: "Unprofitable channels",
    whatIfTitle: "What if: budget reallocation",
    whatIfDesc: "Holds each channel's ROAS and shifts budget to the most profitable channels.",
    maxProfit: "Maximise profit",
    holdRevenue: "Hold revenue",
    totalBudget: "Total budget",
    currentBudgetBtn: "Current",
    currentCostHint: "default = today's cost {cost}",
    projectedNetProfit: "Projected net profit",
    todayValue: "today {value}",
    profitChange: "Profit change",
    revenueSub: "revenue {projected} vs {current}",
    colToday: "Today",
    colProposal: "Proposed",
    colChange: "Change",
    colProfitPerUnit: "Profit / unit",
    colProjProfit: "Proj. profit",
    reallocationFooter: "Allocated {allocated} of {total} · capped at 3× today's channel spend.",
    liveHint: "Margin or budget changes apply live.",
    categoryWorstAlert: "Category {category} has the lowest POAS {poas} — at margin {margin} and revenue share {share} it is losing money. Consider a higher selling price or shifting ad budget elsewhere.",
    netProfitProducts: "Net profit (products)",
    marginVsCogs: "margin from selling price vs cost of goods",
    poasProducts: "POAS (products)",
    blendedMarginSub: "blended margin {value}",
    unprofitableCategories: "Unprofitable categories",
    belowBreakeven: "POAS below break-even",
    colCategory: "Category",
    colRevenueShare: "Revenue share",
    colProductMargin: "Margin",
    productTableFooter: "Margin = 1 − cost of goods (COGS). Ad cost allocated by revenue share.",
    nextStepLabel: "Shift budget",
    nextStepHintHelps: "Reallocation projects +{profit} profit",
    nextStepHintOther: "Reduce unprofitable channels in Campaigns",
    byWeeks: "by week",
    byMonths: "by month",
    week: "week",
    month: "month",
    currencyUnit: "USD",
  },
} as const;

type ViewMode = "channels" | "products";

// --- scenario persistence (#4) ----------------------------------------------

const scenariosKey = (projectId: string) => `systedo.profit.scenarios.${projectId}`;

/** Coerce an unknown blob from localStorage into a clean scenario list, dropping
 *  anything malformed so a corrupt store degrades to "no saved scenarios". */
function coerceScenarios(raw: unknown): MarginScenario[] {
  if (!Array.isArray(raw)) return [];
  const out: MarginScenario[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    if (!Array.isArray(o.margins)) continue;
    const margins: ChannelMargin[] = [];
    for (const m of o.margins) {
      if (m && typeof m === "object") {
        const mo = m as Record<string, unknown>;
        if (typeof mo.channel === "string" && typeof mo.marginPct === "number" && Number.isFinite(mo.marginPct)) {
          margins.push({ channel: mo.channel, marginPct: mo.marginPct });
        }
      }
    }
    out.push({
      id: o.id,
      name: o.name,
      margins,
      savedAt: typeof o.savedAt === "number" ? o.savedAt : 0,
    });
  }
  return out;
}

/** Lazy initializer: read the per-project saved scenarios once, guarding SSR. */
function loadScenarios(projectId: string): MarginScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scenariosKey(projectId));
    return raw ? coerceScenarios(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Compact key metrics for a margin set, for the side-by-side comparison. */
function scenarioMetrics(rows: ChannelRow[], margins: ChannelMargin[]): ProfitSummary {
  return computeProfit(rows, margins).summary;
}

// --- trend sparkline (#3) ---------------------------------------------------

/** Full-width trend sparkline over the shared chart primitive (`responsive`
 *  viewBox sizing, soft area fill, last-point dot). Only the empty-state dash
 *  for sub-2-point series stays local — the shared component renders those as
 *  an empty decorative svg. */
function TrendSpark({
  values,
  color,
  ariaLabel,
}: {
  values: number[];
  color: string;
  ariaLabel: string;
}) {
  const w = 120;
  const h = 34;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label={ariaLabel}>
        <line x1={3} y1={h / 2} x2={w - 3} y2={h / 2} stroke={color} strokeOpacity={0.3} strokeDasharray="2 3" />
      </svg>
    );
  }
  return (
    <Sparkline
      values={values}
      width={w}
      height={h}
      responsive
      className="h-9 w-full"
      stroke={color}
      fill={color}
      areaOpacity={0.1}
      strokeWidth={1.5}
      dot
      label={ariaLabel}
    />
  );
}

/** A small +/− delta pill reused on the summary cards. */
function DeltaPill({ value, fmtSignedPct }: { value: number; fmtSignedPct: (v: number) => string }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0005) {
    return <span className="text-xs font-medium text-muted">→ 0 %</span>;
  }
  const up = value > 0;
  const Icon = up ? TrendUp : TrendDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-positive" : "text-negative"}`}>
      <Icon width={12} height={12} />
      {fmtSignedPct(value)}
    </span>
  );
}

// --- real-numbers override (#ROB-02) ----------------------------------------

const realKey = (projectId: string) => `systedo.profit.real.${projectId}`;

interface RealOverride {
  revenue: number;
  spend: number;
}

/** Per-period real revenue/spend the user entered, keyed by project, from
 *  localStorage (SSR-guarded). Malformed entries degrade to "no override". */
function loadReal(projectId: string): Record<string, RealOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(realKey(projectId));
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, RealOverride> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const r = Number((v as Record<string, unknown>).revenue);
        const s = Number((v as Record<string, unknown>).spend);
        out[k] = {
          revenue: Number.isFinite(r) && r > 0 ? r : 0,
          spend: Number.isFinite(s) && s > 0 ? s : 0,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Scale a channel row to a user-entered real revenue/spend — keeps the channel
 *  mix and (by scaling conversions/visits with revenue) the AOV/CR, recomputing the
 *  ratios so the whole profit view reflects the user's books, not just margin. */
function scaleRow(r: ChannelRow, revScale: number, costScale: number): ChannelRow {
  const revenue = r.revenue * revScale;
  const cost = r.cost * costScale;
  const conversions = r.conversions * revScale;
  const visits = r.visits * revScale;
  return {
    ...r,
    revenue,
    cost,
    conversions,
    visits,
    pno: revenue > 0 ? cost / revenue : 0,
    aov: conversions > 0 ? revenue / conversions : 0,
    cr: visits > 0 ? conversions / visits : 0,
    roas: cost > 0 ? revenue / cost : 0,
  };
}

export default function ProfitModule({
  projectId,
  rowsByPeriod,
  trendByPeriod,
  channels,
  products,
  defaults,
}: {
  projectId: string;
  rowsByPeriod: Record<string, ChannelRow[]>;
  trendByPeriod: Record<string, ProfitTrendPoint[]>;
  channels: ChannelShare[];
  products: ProductCategory[];
  defaults: ChannelMargin[];
}) {
  const fmt = useFormatters();
  const t = useT(T);

  const PERIOD_LABELS: Record<string, string> = {
    "30": t("days30"),
    "90": t("days90"),
    "365": t("months12"),
  };

  const periods = Object.keys(rowsByPeriod);
  const [period, setPeriod] = useState(periods.includes("90") ? "90" : periods[0]!);
  const [margins, setMargins] = useState<ChannelMargin[]>(defaults);
  const [view, setView] = useState<ViewMode>("channels");
  // Real-numbers override (#ROB-02): per-period actual revenue + ad spend, so the
  // whole view reflects the user's books, not just the margin lens.
  const [realByPeriod, setRealByPeriod] = useState<Record<string, RealOverride>>(() => loadReal(projectId));

  const periodRows = useMemo(() => rowsByPeriod[period] ?? [], [rowsByPeriod, period]);

  // Apply the override (when set for this period): scale the channel rows to the
  // user's entered revenue/spend, preserving the mix.
  const real = realByPeriod[period];
  const baseTotals = useMemo(
    () =>
      periodRows.reduce(
        (a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost }),
        { revenue: 0, cost: 0 }
      ),
    [periodRows]
  );
  const revScale = real && real.revenue > 0 && baseTotals.revenue > 0 ? real.revenue / baseTotals.revenue : 1;
  const costScale = real && real.spend > 0 && baseTotals.cost > 0 ? real.spend / baseTotals.cost : 1;
  const overridden = revScale !== 1 || costScale !== 1;
  const effectiveRows = useMemo(
    () => (overridden ? periodRows.map((r) => scaleRow(r, revScale, costScale)) : periodRows),
    [periodRows, revScale, costScale, overridden]
  );

  const { rows, summary } = useMemo(() => computeProfit(effectiveRows, margins), [effectiveRows, margins]);

  // #3 trend: re-drive the server-bucketed series with the live margin model.
  const trend = useMemo(
    () => retargetTrend(trendByPeriod[period] ?? [], channels, margins),
    [trendByPeriod, period, channels, margins]
  );
  const netDelta = useMemo(() => trendDelta(trend, "netProfit"), [trend]);
  const poasDelta = useMemo(() => trendDelta(trend, "poas"), [trend]);

  // #5 overhead toggle.
  const [overhead, setOverhead] = useState<OverheadOptions>({
    enabled: false,
    monthlyOverhead: 120_000,
    perOrderCost: 60,
    months: 1,
  });
  const months = useMemo(() => Math.max(1, (rowsByPeriod[period]?.length ?? 0) > 0 ? Number(period) / 30 : 1), [rowsByPeriod, period]);
  const overheadResult = useMemo(
    () => applyOverhead(effectiveRows, margins, { ...overhead, months }),
    [effectiveRows, margins, overhead, months]
  );

  // #2 product view.
  const productResult = useMemo(
    () => computeProductProfit(products, { revenue: summary.revenue, cost: summary.cost }),
    [products, summary.revenue, summary.cost]
  );
  const worstCategory = useMemo(() => lowestPoasCategory(productResult.rows), [productResult.rows]);

  // "Co kdyby" simulator.
  const [strategy, setStrategy] = useState<ReallocStrategy>("max-profit");
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const budget = budgetOverride ?? summary.cost;
  const plan = useMemo(
    () => reallocateBudget(rows, { totalBudget: budget, strategy }),
    [rows, budget, strategy]
  );

  // #4 scenarios — per-project localStorage.
  const [scenarios, setScenarios] = useState<MarginScenario[]>(() => loadScenarios(projectId));
  const [scenarioName, setScenarioName] = useState("");
  const [compareId, setCompareId] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(scenariosKey(projectId), JSON.stringify(scenarios));
    } catch {
      /* storage unavailable — keep the in-memory list */
    }
  }, [projectId, scenarios]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(realKey(projectId), JSON.stringify(realByPeriod));
    } catch {
      /* storage unavailable — keep the in-memory override */
    }
  }, [projectId, realByPeriod]);

  function setMargin(channel: string, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct)) / 100;
    setMargins((ms) => ms.map((m) => (m.channel === channel ? { ...m, marginPct: clamped } : m)));
  }

  function setReal(field: "revenue" | "spend", value: number) {
    setRealByPeriod((prev) => {
      const current = prev[period] ?? { revenue: 0, spend: 0 };
      return { ...prev, [period]: { ...current, [field]: Math.max(0, value) } };
    });
  }
  function clearReal() {
    setRealByPeriod((prev) => {
      const next = { ...prev };
      delete next[period];
      return next;
    });
  }

  function saveScenario(savedAt: number) {
    const name = scenarioName.trim() || t("scenarioDefaultName", { n: scenarios.length + 1 });
    const id = `sc-${savedAt.toString(36)}`;
    setScenarios((list) => [...list, { id, name, margins: margins.map((m) => ({ ...m })), savedAt }]);
    setScenarioName("");
  }

  function loadScenario(id: string) {
    const sc = scenarios.find((s) => s.id === id);
    if (!sc) return;
    // Map saved margins onto the current channels, defaulting any new channel.
    setMargins(defaults.map((d) => ({
      channel: d.channel,
      marginPct: sc.margins.find((m) => m.channel === d.channel)?.marginPct ?? d.marginPct,
    })));
  }

  function deleteScenario(id: string) {
    setScenarios((list) => list.filter((s) => s.id !== id));
    if (compareId === id) setCompareId("");
  }

  const dirty = margins.some(
    (m) => m.marginPct !== defaults.find((d) => d.channel === m.channel)?.marginPct
  );
  const planHelps = plan.profitDelta > 0.5;

  const compareScenario = scenarios.find((s) => s.id === compareId) ?? null;
  const compareSummary = compareScenario ? scenarioMetrics(effectiveRows, compareScenario.margins) : null;
  const granularityLabel = period === "365" ? t("byMonths") : t("byWeeks");
  const granularityUnit = period === "365" ? t("month") : t("week");

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                period === p ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
              }`}
            >
              {PERIOD_LABELS[p] ?? p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
            {(
              [
                ["channels", t("byChannels")],
                ["products", t("byProducts")],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  view === value ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {dirty && (
            <button
              type="button"
              onClick={() => setMargins(defaults)}
              className="text-sm font-medium text-muted transition-colors hover:text-navy-700"
            >
              {t("resetMargins")}
            </button>
          )}
        </div>
      </div>

      {/* real-numbers override (#ROB-02): enter your actual revenue + ad spend so
          the whole view reflects YOUR books, not just the margin lens. */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-navy-800">{t("realNumbersTitle")}</p>
        <p className="mt-1 text-xs text-muted">
          {t("realNumbersDesc", { period: PERIOD_LABELS[period] ?? period })}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">{t("revenue")}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={real?.revenue ? Math.round(real.revenue) : ""}
              onChange={(e) => setReal("revenue", Number(e.target.value))}
              placeholder={String(Math.round(baseTotals.revenue))}
              className="w-44 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">{t("adSpend")}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={real?.spend ? Math.round(real.spend) : ""}
              onChange={(e) => setReal("spend", Number(e.target.value))}
              placeholder={String(Math.round(baseTotals.cost))}
              className="w-44 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
            />
          </label>
          {overridden && (
            <button
              type="button"
              onClick={clearReal}
              className="rounded-pill border border-line px-3 py-2 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50"
            >
              {t("backToDemo")}
            </button>
          )}
        </div>
        {overridden && (
          <p className="mt-2 text-xs text-positive">
            {t("recalculated")}
          </p>
        )}
      </div>

      {/* summary band with period-over-period delta pills (#3) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("netAdProfit")}</p>
            <DeltaPill value={netDelta} fmtSignedPct={fmt.fmtSignedPct} />
          </div>
          <p
            className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
              summary.netProfit >= 0 ? "text-navy-800" : "text-negative"
            }`}
          >
            {fmt.fmtCZK(summary.netProfit)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("grossProfitSub", { gross: fmt.fmtCZKCompact(summary.grossProfit), cost: fmt.fmtCZKCompact(summary.cost) })}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("poas")}</p>
            <DeltaPill value={poasDelta} fmtSignedPct={fmt.fmtSignedPct} />
          </div>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmt.fmtMultiple(summary.poas)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("poasSub", { roas: fmt.fmtMultiple(summary.roas) })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("blendedMargin")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmt.fmtPct(summary.blendedMargin)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("weightedByRevenue")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("unprofitableChannels")}</p>
          <p
            className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
              summary.unprofitableCount > 0 ? "text-negative" : "text-positive"
            }`}
          >
            {summary.unprofitableCount}
          </p>
          <p className="mt-1 text-xs text-muted">{t("unprofitableAfterMargin")}</p>
        </div>
      </div>

      {/* #3 trend sparklines */}
      {trend.length >= 2 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-navy-800">{t("trendTitle")}</p>
            <p className="text-xs text-muted">{granularityLabel} · {trend.length}</p>
          </div>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("netProfit")}</span>
                <DeltaPill value={netDelta} fmtSignedPct={fmt.fmtSignedPct} />
              </div>
              <div className="mt-1.5">
                <TrendSpark
                  values={trend.map((t) => t.netProfit)}
                  color="var(--color-brand-accent)"
                  ariaLabel={t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtCZK(trend[trend.length - 1]!.netProfit) })}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtCZKCompact(trend[trend.length - 1]!.netProfit) })}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("poas")}</span>
                <DeltaPill value={poasDelta} fmtSignedPct={fmt.fmtSignedPct} />
              </div>
              <div className="mt-1.5">
                <TrendSpark
                  values={trend.map((t) => t.poas)}
                  color="var(--color-navy-500)"
                  ariaLabel={t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtMultiple(trend[trend.length - 1]!.poas) })}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {t("lastPeriod", { granularity: granularityUnit, value: fmt.fmtMultiple(trend[trend.length - 1]!.poas) })}
              </p>
            </div>
          </div>
        </div>
      )}

      {view === "channels" && (
        <>
          {summary.unprofitableCount > 0 && (
            <div className="flex items-start gap-3 rounded-card border border-negative/30 bg-negative-soft px-4 py-3.5">
              <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-negative" />
              <p className="text-sm leading-relaxed text-navy-700">
                <strong>{summary.unprofitableCount}</strong>{" "}
                {summary.unprofitableCount === 1
                  ? t("unprofitableWarning_one")
                  : t("unprofitableWarning_other")}
              </p>
            </div>
          )}

          {/* per-channel table with editable margins */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">{t("colChannel")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colRevenue")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colCost")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colRoas")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colMargin")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colBreakeven")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colPoas")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colNetProfit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.channel} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-navy-800">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.channel}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.revenue)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.cost)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtMultiple(r.roas)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(r.marginPct * 100)}
                            onChange={(e) => setMargin(r.channel, Number(e.target.value))}
                            aria-label={t("marginAriaLabel", { channel: r.channel })}
                            className="tnum w-14 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                          />
                          <span className="text-muted">%</span>
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtMultiple(r.breakEvenRoas)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtMultiple(r.poas)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-semibold ${
                          r.netProfit >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {fmt.fmtCZK(r.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Pill tone="positive">{t("legendProfitable")}</Pill> {t("legendProfitableDesc")}
              </span>
              <span className="flex items-center gap-1.5">
                <Pill tone="negative">{t("legendUnprofitable")}</Pill> {t("legendUnprofitableDesc")}
              </span>
              <span>{t("legendEditHint")}</span>
            </div>
          </div>

          {/* #5 overhead allocation toggle */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">{t("overheadTitle")}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("overheadDesc")}
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-navy-700">
                <input
                  type="checkbox"
                  checked={overhead.enabled}
                  onChange={(e) => setOverhead((o) => ({ ...o, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-2 focus:ring-brand-200"
                />
                {t("overheadInclude")}
              </label>
            </div>

            {overhead.enabled && (
              <>
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="ovh-monthly" className="block text-xs font-medium uppercase tracking-wide text-muted">
                      {t("overheadFixedMonthly")}
                    </label>
                    <div className="mt-1.5 inline-flex items-center gap-1.5">
                      <input
                        id="ovh-monthly"
                        type="number"
                        min={0}
                        step={5000}
                        value={Math.round(overhead.monthlyOverhead)}
                        onChange={(e) => setOverhead((o) => ({ ...o, monthlyOverhead: Math.max(0, Number(e.target.value)) }))}
                        className="tnum w-36 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      <span className="text-sm text-muted">{t("currencyUnit")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{t("overheadMonthsMult", { months: fmt.fmtMultiple(months) })}</p>
                  </div>
                  <div>
                    <label htmlFor="ovh-order" className="block text-xs font-medium uppercase tracking-wide text-muted">
                      {t("overheadPerOrder")}
                    </label>
                    <div className="mt-1.5 inline-flex items-center gap-1.5">
                      <input
                        id="ovh-order"
                        type="number"
                        min={0}
                        step={5}
                        value={Math.round(overhead.perOrderCost)}
                        onChange={(e) => setOverhead((o) => ({ ...o, perOrderCost: Math.max(0, Number(e.target.value)) }))}
                        className="tnum w-28 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      <span className="text-sm text-muted">{t("currencyUnit")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{t("overheadFulfillmentHint")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("contributionPoas")}</p>
                    <p
                      className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                        overheadResult.summary.contributionPoas >= 1 ? "text-navy-800" : "text-negative"
                      }`}
                    >
                      {fmt.fmtMultiple(overheadResult.summary.contributionPoas)}
                    </p>
                    <p className="mt-1 text-xs text-muted">{t("rawPoas", { value: fmt.fmtMultiple(summary.poas) })}</p>
                  </div>
                </div>

                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-4 py-3 font-medium">{t("colChannel")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colRawPoas")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colOverhead")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colFulfillment")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colContributionPoas")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colAdjBreakeven")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("colContribution")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overheadResult.rows.map((r) => (
                        <tr key={r.channel} className="border-b border-line/70 last:border-0">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2 font-medium text-navy-800">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                              {r.channel}
                            </span>
                          </td>
                          <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtMultiple(r.poas)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.allocatedOverhead)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.fulfilmentCost)}</td>
                          <td
                            className={`tnum px-4 py-3 text-right font-medium ${
                              r.contributionPoas >= 1 ? "text-navy-800" : "text-negative"
                            }`}
                          >
                            {fmt.fmtMultiple(r.contributionPoas)}
                          </td>
                          <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtMultiple(r.adjustedBreakEvenRoas)}</td>
                          <td
                            className={`tnum px-4 py-3 text-right font-semibold ${
                              r.contributionProfit >= 0 ? "text-positive" : "text-negative"
                            }`}
                          >
                            {fmt.fmtCZK(r.contributionProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
                  <span>
                    {t("overheadFooter", {
                      overhead: fmt.fmtCZKCompact(overheadResult.summary.totalOverhead),
                      fulfillment: fmt.fmtCZKCompact(overheadResult.summary.totalFulfilment),
                    })}{" "}
                    <strong className={overheadResult.summary.unprofitableCount > 0 ? "text-negative" : "text-positive"}>
                      {overheadResult.summary.unprofitableCount}
                    </strong>
                  </span>
                </div>
              </>
            )}
          </div>

          {/* #4 margin scenarios — save / load / compare */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">{t("scenariosTitle")}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("scenariosDesc")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 px-5 py-4">
              <div>
                <label htmlFor="sc-name" className="block text-xs font-medium uppercase tracking-wide text-muted">
                  {t("scenarioName")}
                </label>
                <input
                  id="sc-name"
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder={t("scenarioPlaceholder")}
                  className="mt-1.5 w-56 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button
                type="button"
                onClick={() => saveScenario(Date.now())}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                {t("saveMargins")}
              </button>
              {scenarios.length > 0 && (
                <div>
                  <label htmlFor="sc-load" className="block text-xs font-medium uppercase tracking-wide text-muted">
                    {t("loadScenario")}
                  </label>
                  <select
                    id="sc-load"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) loadScenario(e.target.value);
                      e.target.value = "";
                    }}
                    className="mt-1.5 w-56 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  >
                    <option value="">{t("loadScenarioSelect")}</option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {scenarios.length > 0 && (
                <div>
                  <label htmlFor="sc-compare" className="block text-xs font-medium uppercase tracking-wide text-muted">
                    {t("compareWith")}
                  </label>
                  <select
                    id="sc-compare"
                    value={compareId}
                    onChange={(e) => setCompareId(e.target.value)}
                    className="mt-1.5 w-56 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  >
                    <option value="">{t("compareNone")}</option>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {compareScenario && compareSummary && (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">{t("colMetric")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("colCurrentMargin")}</th>
                      <th className="px-4 py-3 text-right font-medium">{compareScenario.name}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("colDiff")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [t("rowNetProfit"), summary.netProfit, compareSummary.netProfit, "czk"],
                        [t("poas"), summary.poas, compareSummary.poas, "mult"],
                        [t("rowUnprofitableChannels"), summary.unprofitableCount, compareSummary.unprofitableCount, "count"],
                      ] as const
                    ).map(([label, a, b, kind]) => {
                      const diff = a - b;
                      const fmtVal = (v: number) =>
                        kind === "czk" ? fmt.fmtCZK(v) : kind === "mult" ? fmt.fmtMultiple(v) : String(v);
                      const good = kind === "count" ? diff <= 0 : diff >= 0;
                      return (
                        <tr key={label} className="border-b border-line/70 last:border-0">
                          <td className="px-4 py-3 font-medium text-navy-800">{label}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmtVal(a)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmtVal(b)}</td>
                          <td className={`tnum px-4 py-3 text-right font-semibold ${good ? "text-positive" : "text-negative"}`}>
                            {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                            {fmtVal(Math.abs(diff))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {scenarios.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
                {scenarios.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs text-navy-700">
                    {s.name}
                    <button
                      type="button"
                      onClick={() => deleteScenario(s.id)}
                      aria-label={t("deleteScenario", { name: s.name })}
                      className="text-muted transition-colors hover:text-negative"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* "What if" — budget-reallocation simulator */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">{t("whatIfTitle")}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("whatIfDesc")}
                </p>
              </div>
              <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
                {(
                  [
                    ["max-profit", t("maxProfit")],
                    ["hold-revenue", t("holdRevenue")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStrategy(value)}
                    className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      strategy === value ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <label htmlFor="realloc-budget" className="block text-xs font-medium uppercase tracking-wide text-muted">
                  {t("totalBudget")}
                </label>
                <div className="mt-1.5 inline-flex items-center gap-1.5">
                  <input
                    id="realloc-budget"
                    type="number"
                    min={0}
                    step={1000}
                    value={Math.round(budget)}
                    onChange={(e) => setBudgetOverride(Math.max(0, Number(e.target.value)))}
                    className="tnum w-36 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-right text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <span className="text-sm text-muted">{t("currencyUnit")}</span>
                  {budgetOverride !== null && budgetOverride !== Math.round(summary.cost) && (
                    <button
                      type="button"
                      onClick={() => setBudgetOverride(null)}
                      className="ml-1 text-xs font-medium text-muted transition-colors hover:text-navy-700"
                    >
                      {t("currentBudgetBtn")}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">{t("currentCostHint", { cost: fmt.fmtCZKCompact(summary.cost) })}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("projectedNetProfit")}</p>
                <p
                  className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                    plan.projectedNetProfit >= 0 ? "text-navy-800" : "text-negative"
                  }`}
                >
                  {fmt.fmtCZK(plan.projectedNetProfit)}
                </p>
                <p className="mt-1 text-xs text-muted">{t("todayValue", { value: fmt.fmtCZKCompact(plan.currentNetProfit) })}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("profitChange")}</p>
                <p
                  className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                    plan.profitDelta >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {plan.profitDelta >= 0 ? "+" : "−"}
                  {fmt.fmtCZK(Math.abs(plan.profitDelta))}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t("revenueSub", { projected: fmt.fmtCZKCompact(plan.projectedRevenue), current: fmt.fmtCZKCompact(plan.currentRevenue) })}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">{t("colChannel")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colToday")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colProposal")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colChange")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colProfitPerUnit")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colProjProfit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.channel} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-navy-800">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.channel}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.currentSpend)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtCZKCompact(r.suggestedSpend)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-medium ${
                          r.spendDelta > 0 ? "text-positive" : r.spendDelta < 0 ? "text-negative" : "text-muted"
                        }`}
                      >
                        {r.spendDelta > 0 ? "+" : r.spendDelta < 0 ? "−" : ""}
                        {fmt.fmtCZKCompact(Math.abs(r.spendDelta))}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtMultiple(r.roas * r.marginPct)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-semibold ${
                          r.projectedNetProfit >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {fmt.fmtCZK(r.projectedNetProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span>
                {t("reallocationFooter", { allocated: fmt.fmtCZKCompact(plan.allocatedSpend), total: fmt.fmtCZKCompact(plan.totalBudget) })}
              </span>
              <span>{t("liveHint")}</span>
            </div>
          </div>
        </>
      )}

      {/* #2 product / category view */}
      {view === "products" && (
        <>
          {worstCategory && worstCategory.poas < 1 && (
            <div className="flex items-start gap-3 rounded-card border border-negative/30 bg-negative-soft px-4 py-3.5">
              <Layers width={18} height={18} className="mt-0.5 shrink-0 text-negative" />
              <p className="text-sm leading-relaxed text-navy-700">
                {t("categoryWorstAlert", {
                  category: worstCategory.category,
                  poas: fmt.fmtMultiple(worstCategory.poas),
                  margin: fmt.fmtPct(worstCategory.marginPct),
                  share: fmt.fmtPct(worstCategory.revenueShare),
                })}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("netProfitProducts")}</p>
              <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.netProfit >= 0 ? "text-navy-800" : "text-negative"}`}>
                {fmt.fmtCZK(productResult.summary.netProfit)}
              </p>
              <p className="mt-1 text-xs text-muted">{t("marginVsCogs")}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("poasProducts")}</p>
              <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
                {fmt.fmtMultiple(productResult.summary.poas)}
              </p>
              <p className="mt-1 text-xs text-muted">{t("blendedMarginSub", { value: fmt.fmtPct(productResult.summary.blendedMargin) })}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("unprofitableCategories")}</p>
              <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.unprofitableCount > 0 ? "text-negative" : "text-positive"}`}>
                {productResult.summary.unprofitableCount}
              </p>
              <p className="mt-1 text-xs text-muted">{t("belowBreakeven")}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">{t("colCategory")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colRevenueShare")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colRevenue")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colCost")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colProductMargin")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colPoas")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colNetProfit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {productResult.rows.map((r) => (
                    <tr key={r.category} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-navy-800">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                          {r.category}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtPct(r.revenueShare)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.revenue)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZKCompact(r.cost)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(r.marginPct)}</td>
                      <td className={`tnum px-4 py-3 text-right font-medium ${r.poas >= 1 ? "text-navy-800" : "text-negative"}`}>
                        {fmt.fmtMultiple(r.poas)}
                      </td>
                      <td className={`tnum px-4 py-3 text-right font-semibold ${r.netProfit >= 0 ? "text-positive" : "text-negative"}`}>
                        {fmt.fmtCZK(r.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span>{t("productTableFooter")}</span>
            </div>
          </div>
        </>
      )}

      <NextSteps
        steps={[
          {
            to: "kampane",
            label: t("nextStepLabel"),
            hint: planHelps
              ? t("nextStepHintHelps", { profit: fmt.fmtCZK(plan.profitDelta) })
              : t("nextStepHintOther"),
          },
        ]}
      />
    </div>
  );
}
