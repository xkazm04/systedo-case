"use client";

/** All shared state, derived metrics and the persistence lifecycle for the Profit
 *  module. Extracted verbatim from ProfitModule when it was decomposed into panels:
 *  the composition root and the panels stay presentational; every stateful concern —
 *  margins editing, real-numbers override, scenarios, overhead, reallocation, the
 *  apply-to-report call, and the Direction-1 persistence (one-time localStorage
 *  migration + ready gate + 700ms debounced POST, wired/demo distinction) — lives
 *  here unchanged. */

import { useEffect, useMemo, useState } from "react";
import { aov, cr, pno, roas, type ChannelRow } from "@/lib/metrics";
import type { ChannelShare } from "@/lib/types";
import { monthsForDays } from "@/lib/profit/core";
import { marginDivergence } from "@/lib/profit/reconcile";
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
import {
  coerceScenarios,
  coerceRealNumbers,
  type FinanceInputs,
  type RealOverride,
} from "@/lib/profit/finance-inputs/types";
import { useT } from "@/lib/i18n/client";
import { T } from "./strings";

export type ViewMode = "channels" | "products";

// --- legacy localStorage keys (Direction 1 migration) -----------------------
// The profit inputs used to live in the browser: margin scenarios and the
// per-period real-numbers override under these two keys. They now persist
// server-side in the finance-inputs store; these keys are read ONCE on first load
// (see the migration effect) to lift any existing local values into the store,
// then cleared. New writes never touch localStorage again.

const scenariosKey = (projectId: string) => `systedo.profit.scenarios.${projectId}`;

/** Compact key metrics for a margin set, for the side-by-side comparison. */
function scenarioMetrics(rows: ChannelRow[], margins: ChannelMargin[]): ProfitSummary {
  return computeProfit(rows, margins).summary;
}

// --- real-numbers override (#ROB-02) ----------------------------------------
// The per-period real revenue/spend override (RealOverride) now persists in the
// finance-inputs store; its legacy localStorage key is migrated once on load.

const realKey = (projectId: string) => `systedo.profit.real.${projectId}`;

/** Read any legacy browser-local finance inputs (scenarios + real numbers) for the
 *  one-time migration into the server store. Returns null outside the browser or when
 *  nothing legacy is present. Reuses the shared wire-coercers so the migrated shape is
 *  identical to a server round-trip. */
function readLegacyLocal(
  projectId: string
): { scenarios: MarginScenario[]; realNumbers: Record<string, RealOverride> } | null {
  if (typeof window === "undefined") return null;
  try {
    const rawScenarios = window.localStorage.getItem(scenariosKey(projectId));
    const rawReal = window.localStorage.getItem(realKey(projectId));
    if (rawScenarios === null && rawReal === null) return null;
    const scenarios = rawScenarios ? coerceScenarios(JSON.parse(rawScenarios)) : [];
    const realNumbers = rawReal ? coerceRealNumbers(JSON.parse(rawReal)) : {};
    return { scenarios, realNumbers };
  } catch {
    return null;
  }
}

/** Drop the legacy browser-local keys after migration, so they are never read again. */
function clearLegacyLocal(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scenariosKey(projectId));
    window.localStorage.removeItem(realKey(projectId));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Seed the live per-channel margins from the saved set (mapped onto the current
 *  channels, defaulting any new channel), else the defaults. */
function seedMargins(defaults: ChannelMargin[], saved?: ChannelMargin[]): ChannelMargin[] {
  if (!saved || saved.length === 0) return defaults;
  return defaults.map((d) => ({
    channel: d.channel,
    marginPct: saved.find((m) => m.channel === d.channel)?.marginPct ?? d.marginPct,
  }));
}

/** Persist the owner's finance inputs to the server store (best-effort — the caller
 *  swallows failures; the wire is re-sanitized server-side regardless). */
async function postFinanceInputs(
  projectId: string,
  body: { scenarios: MarginScenario[]; realNumbers: Record<string, RealOverride>; channelMargins: ChannelMargin[] }
): Promise<void> {
  try {
    await fetch(`/api/projects/${projectId}/finance-inputs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* offline / store hiccup — the in-memory state remains the session source of truth */
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
    pno: pno(cost, revenue),
    aov: aov(revenue, conversions),
    cr: cr(conversions, visits),
    roas: roas(revenue, cost),
  };
}

export type UseProfitStateArgs = {
  projectId: string;
  rowsByPeriod: Record<string, ChannelRow[]>;
  trendByPeriod: Record<string, ProfitTrendPoint[]>;
  channels: ChannelShare[];
  products: ProductCategory[];
  defaults: ChannelMargin[];
  live: boolean;
  financeInputs?: FinanceInputs | null;
  costModel: { grossMarginPct: number; monthlyOverhead: number; perOrderCost: number } | null;
};

export function useProfitState({
  projectId,
  rowsByPeriod,
  trendByPeriod,
  channels,
  products,
  defaults,
  financeInputs,
  costModel,
}: UseProfitStateArgs) {
  const t = useT(T);

  // Direction 1: whether persistence is wired (a real /zisk surface passes the prop,
  // even when null; the demo omits it → ephemeral, no persist / no migration).
  const wired = financeInputs !== undefined;

  const periods = Object.keys(rowsByPeriod);
  const [period, setPeriod] = useState(periods.includes("90") ? "90" : periods[0]!);
  // Direction 1: the three input surfaces now seed from the SERVER prop (financeInputs),
  // which is identical on SSR + first client render, so there is no hydration mismatch
  // and no post-mount hydration dance — the owner's own numbers render on first paint.
  const [margins, setMargins] = useState<ChannelMargin[]>(() =>
    seedMargins(defaults, financeInputs?.channelMargins)
  );
  const [view, setView] = useState<ViewMode>("channels");
  // Real-numbers override (#ROB-02): per-period actual revenue + ad spend, so the
  // whole view reflects the user's books, not just the margin lens. Seeded from the
  // server prop (see above).
  const [realByPeriod, setRealByPeriod] = useState<Record<string, RealOverride>>(
    () => financeInputs?.realNumbers ?? {}
  );

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

  // Direction 2 — reconciliation: this module's revenue-weighted blended margin vs the
  // report's persisted single blended margin. When they drift ≥ threshold p.b. the same
  // e-shop would read two different profits in two tabs, so we surface both numbers and
  // point at the "apply to report" fix. Pure decision (marginDivergence), reactive to
  // live margin edits so the note clears as the user converges on the report's model.
  const reconcile = useMemo(
    () => marginDivergence(summary.blendedMargin, costModel?.grossMarginPct),
    [summary.blendedMargin, costModel]
  );

  // #3 trend: re-drive the server-bucketed series with the live margin model.
  const trend = useMemo(
    () => retargetTrend(trendByPeriod[period] ?? [], channels, margins),
    [trendByPeriod, period, channels, margins]
  );
  const netDelta = useMemo(() => trendDelta(trend, "netProfit"), [trend]);
  const poasDelta = useMemo(() => trendDelta(trend, "poas"), [trend]);

  // #5 overhead toggle. Seeded from the shared server cost model (A3) when saved, so
  // overhead is no longer ephemeral and agrees with the monthly report.
  const [overhead, setOverhead] = useState<OverheadOptions>({
    enabled: Boolean(costModel),
    monthlyOverhead: costModel?.monthlyOverhead ?? 120_000,
    perOrderCost: costModel?.perOrderCost ?? 60,
    months: 1,
  });
  const months = useMemo(() => Math.max(1, (rowsByPeriod[period]?.length ?? 0) > 0 ? monthsForDays(Number(period)) : 1), [rowsByPeriod, period]);
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

  // Unify with the report: publish this module's blended margin + overhead to the
  // shared server cost model (A3), so the monthly report's Zisk uses the same
  // numbers. The overhead above is seeded from the same model on load.
  const [applyState, setApplyState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function applyToReport() {
    setApplyState("busy");
    try {
      const res = await fetch(`/api/projects/${projectId}/cost-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossMarginPct: summary.blendedMargin,
          monthlyOverhead: overhead.monthlyOverhead,
          perOrderCost: overhead.perOrderCost,
        }),
      });
      setApplyState(res.ok ? "done" : "error");
    } catch {
      setApplyState("error");
    }
  }

  // #4 scenarios — seeded from the server prop (Direction 1).
  const [scenarios, setScenarios] = useState<MarginScenario[]>(() => financeInputs?.scenarios ?? []);
  const [scenarioName, setScenarioName] = useState("");
  const [compareId, setCompareId] = useState<string>("");

  // Direction 1 — one-time localStorage migration + server persistence.
  // `ready` gates the persist effect so the migration decision lands BEFORE any POST
  // (and so the initial server-seeded state never round-trips straight back). STATE, not
  // a ref, so the persist effect re-runs once it flips. Per-project (the module remounts
  // on a project route change).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Lift any pre-existing browser-local inputs into the store EXACTLY ONCE (wired
    // projects only): only when the server has nothing yet — a first-time migration —
    // so a device that already synced never has its server truth overwritten by stale
    // local values. Either way the legacy keys are dropped afterwards and never read
    // again; then `ready` flips to enable persistence. All setState here is the
    // intended once-per-mount initialization (see the old `hydrated` gate).
    const legacy = wired ? readLegacyLocal(projectId) : null;
    if (
      wired &&
      !financeInputs &&
      legacy &&
      (legacy.scenarios.length > 0 || Object.keys(legacy.realNumbers).length > 0)
    ) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setScenarios(legacy.scenarios);
      setRealByPeriod(legacy.realNumbers);
      /* eslint-enable react-hooks/set-state-in-effect */
      void postFinanceInputs(projectId, {
        scenarios: legacy.scenarios,
        realNumbers: legacy.realNumbers,
        channelMargins: margins,
      });
    }
    if (wired) clearLegacyLocal(projectId);
    setReady(true);
    // Migration runs once per project mount; margins is intentionally read at run time
    // (its latest value) without re-triggering — the persist effect handles later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, wired]);

  // Debounced persistence: after the migration settles, any change to the three input
  // surfaces is written back as one blob (700ms after the last edit, so a margin slider
  // drag is a single POST). Failures are swallowed — the in-memory state is the session
  // source of truth and a transient store hiccup must never break the module.
  useEffect(() => {
    if (!wired || !ready) return;
    const id = setTimeout(() => {
      void postFinanceInputs(projectId, {
        scenarios,
        realNumbers: realByPeriod,
        channelMargins: margins,
      });
    }, 700);
    return () => clearTimeout(id);
  }, [wired, ready, projectId, scenarios, realByPeriod, margins]);

  function setMargin(channel: string, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct)) / 100;
    setMargins((ms) => ms.map((m) => (m.channel === channel ? { ...m, marginPct: clamped } : m)));
  }

  function resetMargins() {
    setMargins(defaults);
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

  return {
    periods,
    period,
    setPeriod,
    view,
    setView,
    margins,
    real,
    baseTotals,
    overridden,
    rows,
    summary,
    reconcile,
    trend,
    netDelta,
    poasDelta,
    overhead,
    setOverhead,
    months,
    overheadResult,
    productResult,
    worstCategory,
    strategy,
    setStrategy,
    budget,
    budgetOverride,
    setBudgetOverride,
    plan,
    applyState,
    applyToReport,
    scenarios,
    scenarioName,
    setScenarioName,
    compareId,
    setCompareId,
    saveScenario,
    loadScenario,
    deleteScenario,
    setMargin,
    resetMargins,
    setReal,
    clearReal,
    dirty,
    planHelps,
    compareScenario,
    compareSummary,
  };
}
