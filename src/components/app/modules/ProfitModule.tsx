"use client";

import { useEffect, useMemo, useState } from "react";
import { Bulb, Layers, TrendUp, TrendDown } from "@/components/icons";
import { Pill } from "@/components/ui";
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
import { fmtCZK, fmtCZKCompact, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";

const PERIOD_LABELS: Record<string, string> = {
  "30": "30 dní",
  "90": "90 dní",
  "365": "12 měsíců",
};

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

/** Hand-rolled SVG sparkline for one trend series (no chart lib). Maps values to
 *  a viewBox, draws a polyline + a soft area fill, marks the last point. */
function Sparkline({
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
  const pad = 3;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label={ariaLabel}>
        <line x1={pad} y1={h / 2} x2={w - pad} y2={h / 2} stroke={color} strokeOpacity={0.3} strokeDasharray="2 3" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${pts} ${w - pad},${h - pad}`;
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]!);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label={ariaLabel}>
      <polygon points={area} fill={color} fillOpacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.2} fill={color} />
    </svg>
  );
}

/** A small +/− delta pill reused on the summary cards. */
function DeltaPill({ value }: { value: number }) {
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
  const periods = Object.keys(rowsByPeriod);
  const [period, setPeriod] = useState(periods.includes("90") ? "90" : periods[0]!);
  const [margins, setMargins] = useState<ChannelMargin[]>(defaults);
  const [view, setView] = useState<ViewMode>("channels");

  const periodRows = useMemo(() => rowsByPeriod[period] ?? [], [rowsByPeriod, period]);
  const { rows, summary } = useMemo(() => computeProfit(periodRows, margins), [periodRows, margins]);

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
    () => applyOverhead(periodRows, margins, { ...overhead, months }),
    [periodRows, margins, overhead, months]
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

  function setMargin(channel: string, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct)) / 100;
    setMargins((ms) => ms.map((m) => (m.channel === channel ? { ...m, marginPct: clamped } : m)));
  }

  function saveScenario(savedAt: number) {
    const name = scenarioName.trim() || `Scénář ${scenarios.length + 1}`;
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
  const compareSummary = compareScenario ? scenarioMetrics(periodRows, compareScenario.margins) : null;
  const granularityLabel = period === "365" ? "po měsících" : "po týdnech";

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
                ["channels", "Podle kanálů"],
                ["products", "Podle produktů"],
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
              Obnovit výchozí marže
            </button>
          )}
        </div>
      </div>

      {/* summary band with period-over-period delta pills (#3) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Čistý zisk z reklamy</p>
            <DeltaPill value={netDelta} />
          </div>
          <p
            className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
              summary.netProfit >= 0 ? "text-navy-800" : "text-negative"
            }`}
          >
            {fmtCZK(summary.netProfit)}
          </p>
          <p className="mt-1 text-xs text-muted">hrubý zisk {fmtCZKCompact(summary.grossProfit)} − náklady {fmtCZKCompact(summary.cost)}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">POAS</p>
            <DeltaPill value={poasDelta} />
          </div>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtMultiple(summary.poas)}
          </p>
          <p className="mt-1 text-xs text-muted">zisk na korunu reklamy · ROAS {fmtMultiple(summary.roas)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Blended marže</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtPct(summary.blendedMargin)}
          </p>
          <p className="mt-1 text-xs text-muted">vážená obratem</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Ztrátové kanály</p>
          <p
            className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
              summary.unprofitableCount > 0 ? "text-negative" : "text-positive"
            }`}
          >
            {summary.unprofitableCount}
          </p>
          <p className="mt-1 text-xs text-muted">prodělávají po marži</p>
        </div>
      </div>

      {/* #3 trend sparklines */}
      {trend.length >= 2 && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-navy-800">Vývoj zisku a POAS v čase</p>
            <p className="text-xs text-muted">{granularityLabel} · {trend.length} období</p>
          </div>
          <div className="mt-3 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Čistý zisk</span>
                <DeltaPill value={netDelta} />
              </div>
              <div className="mt-1.5">
                <Sparkline
                  values={trend.map((t) => t.netProfit)}
                  color="#1f8f88"
                  ariaLabel={`Vývoj čistého zisku, ${trend.length} období, poslední ${fmtCZK(trend[trend.length - 1]!.netProfit)}`}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                poslední {granularityLabel.replace("po ", "")} {fmtCZKCompact(trend[trend.length - 1]!.netProfit)}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">POAS</span>
                <DeltaPill value={poasDelta} />
              </div>
              <div className="mt-1.5">
                <Sparkline
                  values={trend.map((t) => t.poas)}
                  color="#15324b"
                  ariaLabel={`Vývoj POAS, ${trend.length} období, poslední ${fmtMultiple(trend[trend.length - 1]!.poas)}`}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                poslední {granularityLabel.replace("po ", "")} {fmtMultiple(trend[trend.length - 1]!.poas)}
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
                {summary.unprofitableCount === 1 ? "kanál vypadá" : "kanály/ů vypadá"} podle ROAS dobře, ale
                po započtení marže <strong>prodělává</strong> — jejich ROAS je pod bodem zvratu (1 / marže).
                Zvažte přesun rozpočtu do ziskových kanálů.
              </p>
            </div>
          )}

          {/* per-channel table with editable margins */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Kanál</th>
                    <th className="px-4 py-3 text-right font-medium">Obrat</th>
                    <th className="px-4 py-3 text-right font-medium">Náklady</th>
                    <th className="px-4 py-3 text-right font-medium">ROAS</th>
                    <th className="px-4 py-3 text-right font-medium">Marže</th>
                    <th className="px-4 py-3 text-right font-medium">Bod zvratu</th>
                    <th className="px-4 py-3 text-right font-medium">POAS</th>
                    <th className="px-4 py-3 text-right font-medium">Čistý zisk</th>
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
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.revenue)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.cost)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtMultiple(r.roas)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(r.marginPct * 100)}
                            onChange={(e) => setMargin(r.channel, Number(e.target.value))}
                            aria-label={`Marže ${r.channel}`}
                            className="tnum w-14 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                          />
                          <span className="text-muted">%</span>
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-muted">{fmtMultiple(r.breakEvenRoas)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtMultiple(r.poas)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-semibold ${
                          r.netProfit >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {fmtCZK(r.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Pill tone="positive">Ziskový</Pill> ROAS ≥ bod zvratu
              </span>
              <span className="flex items-center gap-1.5">
                <Pill tone="negative">Ztrátový</Pill> ROAS pod bodem zvratu (1 / marže)
              </span>
              <span>Marže upravte v tabulce — vše se přepočítá živě.</span>
            </div>
          </div>

          {/* #5 overhead allocation toggle */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">Zahrnout režijní náklady</p>
                <p className="mt-0.5 text-xs text-muted">
                  Rozpočítá fixní režii podle obratu a odečte fulfillment na objednávku → skutečný příspěvkový POAS.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-navy-700">
                <input
                  type="checkbox"
                  checked={overhead.enabled}
                  onChange={(e) => setOverhead((o) => ({ ...o, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-line text-brand-600 focus:ring-2 focus:ring-brand-200"
                />
                Zahrnout
              </label>
            </div>

            {overhead.enabled && (
              <>
                <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="ovh-monthly" className="block text-xs font-medium uppercase tracking-wide text-muted">
                      Fixní režie / měsíc
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
                      <span className="text-sm text-muted">Kč</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">× {fmtMultiple(months)} měsíce období</p>
                  </div>
                  <div>
                    <label htmlFor="ovh-order" className="block text-xs font-medium uppercase tracking-wide text-muted">
                      Náklad / objednávku
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
                      <span className="text-sm text-muted">Kč</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">fulfillment, balné, doprava</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">Příspěvkový POAS</p>
                    <p
                      className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                        overheadResult.summary.contributionPoas >= 1 ? "text-navy-800" : "text-negative"
                      }`}
                    >
                      {fmtMultiple(overheadResult.summary.contributionPoas)}
                    </p>
                    <p className="mt-1 text-xs text-muted">surový POAS {fmtMultiple(summary.poas)}</p>
                  </div>
                </div>

                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-4 py-3 font-medium">Kanál</th>
                        <th className="px-4 py-3 text-right font-medium">Surový POAS</th>
                        <th className="px-4 py-3 text-right font-medium">Režie</th>
                        <th className="px-4 py-3 text-right font-medium">Fulfillment</th>
                        <th className="px-4 py-3 text-right font-medium">Příspěvkový POAS</th>
                        <th className="px-4 py-3 text-right font-medium">Upravený bod zvratu</th>
                        <th className="px-4 py-3 text-right font-medium">Příspěvek</th>
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
                          <td className="tnum px-4 py-3 text-right text-muted">{fmtMultiple(r.poas)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.allocatedOverhead)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.fulfilmentCost)}</td>
                          <td
                            className={`tnum px-4 py-3 text-right font-medium ${
                              r.contributionPoas >= 1 ? "text-navy-800" : "text-negative"
                            }`}
                          >
                            {fmtMultiple(r.contributionPoas)}
                          </td>
                          <td className="tnum px-4 py-3 text-right text-muted">{fmtMultiple(r.adjustedBreakEvenRoas)}</td>
                          <td
                            className={`tnum px-4 py-3 text-right font-semibold ${
                              r.contributionProfit >= 0 ? "text-positive" : "text-negative"
                            }`}
                          >
                            {fmtCZK(r.contributionProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
                  <span>
                    Režie {fmtCZKCompact(overheadResult.summary.totalOverhead)} + fulfillment{" "}
                    {fmtCZKCompact(overheadResult.summary.totalFulfilment)} rozpočítáno · ztrátových po režii{" "}
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
                <p className="text-sm font-semibold text-navy-800">Scénáře marží</p>
                <p className="mt-0.5 text-xs text-muted">
                  Uložte si sadu marží pod názvem a porovnejte dva scénáře vedle sebe.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 px-5 py-4">
              <div>
                <label htmlFor="sc-name" className="block text-xs font-medium uppercase tracking-wide text-muted">
                  Název scénáře
                </label>
                <input
                  id="sc-name"
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  placeholder="např. Konzervativní marže"
                  className="mt-1.5 w-56 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>
              <button
                type="button"
                onClick={() => saveScenario(Date.now())}
                className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                Uložit aktuální marže
              </button>
              {scenarios.length > 0 && (
                <div>
                  <label htmlFor="sc-load" className="block text-xs font-medium uppercase tracking-wide text-muted">
                    Načíst scénář
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
                    <option value="">Vyberte…</option>
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
                    Porovnat s
                  </label>
                  <select
                    id="sc-compare"
                    value={compareId}
                    onChange={(e) => setCompareId(e.target.value)}
                    className="mt-1.5 w-56 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  >
                    <option value="">Žádný</option>
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
                      <th className="px-4 py-3 font-medium">Metrika</th>
                      <th className="px-4 py-3 text-right font-medium">Aktuální marže</th>
                      <th className="px-4 py-3 text-right font-medium">{compareScenario.name}</th>
                      <th className="px-4 py-3 text-right font-medium">Rozdíl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Čistý zisk", summary.netProfit, compareSummary.netProfit, "czk"],
                        ["POAS", summary.poas, compareSummary.poas, "mult"],
                        ["Ztrátové kanály", summary.unprofitableCount, compareSummary.unprofitableCount, "count"],
                      ] as const
                    ).map(([label, a, b, kind]) => {
                      const diff = a - b;
                      const fmt = (v: number) =>
                        kind === "czk" ? fmtCZK(v) : kind === "mult" ? fmtMultiple(v) : String(v);
                      const good = kind === "count" ? diff <= 0 : diff >= 0;
                      return (
                        <tr key={label} className="border-b border-line/70 last:border-0">
                          <td className="px-4 py-3 font-medium text-navy-800">{label}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmt(a)}</td>
                          <td className="tnum px-4 py-3 text-right text-navy-700">{fmt(b)}</td>
                          <td className={`tnum px-4 py-3 text-right font-semibold ${good ? "text-positive" : "text-negative"}`}>
                            {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                            {fmt(Math.abs(diff))}
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
                      aria-label={`Smazat scénář ${s.name}`}
                      className="text-muted transition-colors hover:text-negative"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* "Co kdyby" — budget-reallocation simulator */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">Co kdyby: přerozdělení rozpočtu</p>
                <p className="mt-0.5 text-xs text-muted">
                  Drží ROAS každého kanálu a přesouvá rozpočet do nejziskovějších kanálů.
                </p>
              </div>
              <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
                {(
                  [
                    ["max-profit", "Maximalizovat zisk"],
                    ["hold-revenue", "Udržet obrat"],
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
                  Celkový rozpočet
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
                  <span className="text-sm text-muted">Kč</span>
                  {budgetOverride !== null && budgetOverride !== Math.round(summary.cost) && (
                    <button
                      type="button"
                      onClick={() => setBudgetOverride(null)}
                      className="ml-1 text-xs font-medium text-muted transition-colors hover:text-navy-700"
                    >
                      Aktuální
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">výchozí = dnešní náklady {fmtCZKCompact(summary.cost)}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Projektovaný čistý zisk</p>
                <p
                  className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                    plan.projectedNetProfit >= 0 ? "text-navy-800" : "text-negative"
                  }`}
                >
                  {fmtCZK(plan.projectedNetProfit)}
                </p>
                <p className="mt-1 text-xs text-muted">dnes {fmtCZKCompact(plan.currentNetProfit)}</p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Změna zisku</p>
                <p
                  className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${
                    plan.profitDelta >= 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {plan.profitDelta >= 0 ? "+" : "−"}
                  {fmtCZK(Math.abs(plan.profitDelta))}
                </p>
                <p className="mt-1 text-xs text-muted">
                  obrat {fmtCZKCompact(plan.projectedRevenue)} vs {fmtCZKCompact(plan.currentRevenue)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Kanál</th>
                    <th className="px-4 py-3 text-right font-medium">Dnes</th>
                    <th className="px-4 py-3 text-right font-medium">Návrh</th>
                    <th className="px-4 py-3 text-right font-medium">Změna</th>
                    <th className="px-4 py-3 text-right font-medium">Zisk / Kč</th>
                    <th className="px-4 py-3 text-right font-medium">Projekt. zisk</th>
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
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.currentSpend)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtCZKCompact(r.suggestedSpend)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-medium ${
                          r.spendDelta > 0 ? "text-positive" : r.spendDelta < 0 ? "text-negative" : "text-muted"
                        }`}
                      >
                        {r.spendDelta > 0 ? "+" : r.spendDelta < 0 ? "−" : ""}
                        {fmtCZKCompact(Math.abs(r.spendDelta))}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-muted">{fmtMultiple(r.roas * r.marginPct)}</td>
                      <td
                        className={`tnum px-4 py-3 text-right font-semibold ${
                          r.projectedNetProfit >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {fmtCZK(r.projectedNetProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span>
                Rozděleno {fmtCZKCompact(plan.allocatedSpend)} z {fmtCZKCompact(plan.totalBudget)} · strop 3× dnešní útraty
                kanálu.
              </span>
              <span>Změna marže nebo rozpočtu se promítne živě.</span>
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
                Kategorie <strong>{worstCategory.category}</strong> má nejnižší POAS{" "}
                <strong>{fmtMultiple(worstCategory.poas)}</strong> — při marži {fmtPct(worstCategory.marginPct)} a
                podílu {fmtPct(worstCategory.revenueShare)} obratu prodělává. Zvažte vyšší prodejní cenu nebo
                přesun reklamního rozpočtu jinam.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Čistý zisk (produkty)</p>
              <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.netProfit >= 0 ? "text-navy-800" : "text-negative"}`}>
                {fmtCZK(productResult.summary.netProfit)}
              </p>
              <p className="mt-1 text-xs text-muted">marže z prodejní ceny vs cena zboží</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">POAS (produkty)</p>
              <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
                {fmtMultiple(productResult.summary.poas)}
              </p>
              <p className="mt-1 text-xs text-muted">blended marže {fmtPct(productResult.summary.blendedMargin)}</p>
            </div>
            <div className="card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Ztrátové kategorie</p>
              <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${productResult.summary.unprofitableCount > 0 ? "text-negative" : "text-positive"}`}>
                {productResult.summary.unprofitableCount}
              </p>
              <p className="mt-1 text-xs text-muted">POAS pod bodem zvratu</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Kategorie</th>
                    <th className="px-4 py-3 text-right font-medium">Podíl obratu</th>
                    <th className="px-4 py-3 text-right font-medium">Obrat</th>
                    <th className="px-4 py-3 text-right font-medium">Náklady</th>
                    <th className="px-4 py-3 text-right font-medium">Marže</th>
                    <th className="px-4 py-3 text-right font-medium">POAS</th>
                    <th className="px-4 py-3 text-right font-medium">Čistý zisk</th>
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
                      <td className="tnum px-4 py-3 text-right text-muted">{fmtPct(r.revenueShare)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.revenue)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZKCompact(r.cost)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(r.marginPct)}</td>
                      <td className={`tnum px-4 py-3 text-right font-medium ${r.poas >= 1 ? "text-navy-800" : "text-negative"}`}>
                        {fmtMultiple(r.poas)}
                      </td>
                      <td className={`tnum px-4 py-3 text-right font-semibold ${r.netProfit >= 0 ? "text-positive" : "text-negative"}`}>
                        {fmtCZK(r.netProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
              <span>Marže = 1 − cena zboží (COGS). Reklamní náklady rozpočítány podle podílu na obratu.</span>
            </div>
          </div>
        </>
      )}

      <NextSteps
        steps={[
          {
            to: "kampane",
            label: "Přesunout rozpočet",
            hint: planHelps
              ? `Přerozdělení slibuje +${fmtCZK(plan.profitDelta)} zisku`
              : "Omezit ztrátové kanály v Kampaních",
          },
        ]}
      />
    </div>
  );
}
