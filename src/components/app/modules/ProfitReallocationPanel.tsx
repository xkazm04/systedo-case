"use client";

/** "What if" budget-reallocation simulator: pick a strategy (max-profit /
 *  hold-revenue) and a total budget, and see each channel's suggested spend and
 *  the projected net-profit change. Co-located "use client" child of ProfitModule —
 *  the reallocation math (`reallocateBudget`) runs in the orchestrator; this panel
 *  receives the already-computed `plan` plus the budget/strategy state + setters.
 *  The per-channel rows — and their fitted-curve / linear disclosure — live in
 *  ./profit/ReallocationTable. */

import type { Dispatch, SetStateAction } from "react";
import type { ReallocPlan, ReallocStrategy } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import ReallocationTable from "./profit/ReallocationTable";

const T = {
  cs: {
    whatIfTitle: "Co kdyby: přerozdělení rozpočtu",
    whatIfDesc: "Přesouvá rozpočet tam, kde další koruna vydělá nejvíc — podle křivky odezvy tam, kde na ni jsou data; jinde drží dnešní ROAS.",
    maxProfit: "Maximalizovat zisk",
    holdRevenue: "Udržet obrat",
    totalBudget: "Celkový rozpočet",
    currentBudgetBtn: "Aktuální",
    currentCostHint: "výchozí = dnešní náklady {cost}",
    projectedNetProfit: "Projektovaný čistý zisk",
    todayValue: "dnes {value}",
    profitChange: "Změna zisku",
    revenueSub: "obrat {projected} vs {current}",
    reallocationFooter: "Rozděleno {allocated} z {total} · strop 3× dnešní útraty kanálu.",
    reallocationFooterCurve:
      "Rozděleno {allocated} z {total} · mezní zisk po křivce odezvy tam, kde na ni jsou data; ostatní kanály drží strop 3× dnešní útraty.",
    liveHint: "Změna marže nebo rozpočtu se promítne živě.",
    currencyUnit: "Kč",
  },
  en: {
    whatIfTitle: "What if: budget reallocation",
    whatIfDesc: "Shifts budget to where the next unit earns most — by marginal profit along the fitted response curve where data allows, holding today's ROAS elsewhere.",
    maxProfit: "Maximize profit",
    holdRevenue: "Hold revenue",
    totalBudget: "Total budget",
    currentBudgetBtn: "Current",
    currentCostHint: "default = today's cost {cost}",
    projectedNetProfit: "Projected net profit",
    todayValue: "today {value}",
    profitChange: "Profit change",
    revenueSub: "revenue {projected} vs {current}",
    reallocationFooter: "Allocated {allocated} of {total} · capped at 3× today's channel spend.",
    reallocationFooterCurve:
      "Allocated {allocated} of {total} · marginal profit along the response curve where data allows; the other channels keep the 3× spend cap.",
    liveHint: "Margin or budget changes apply live.",
    // "CZK", not "USD" — see profit/strings.ts; the budget input is koruny in
    // both locales and these two panels render on the same screen. English writes
    // the koruna as "CZK" (operator ruling 2026-09-14, docs/i18n/style-en.md).
    currencyUnit: "CZK",
  },
} as const;

export default function ProfitReallocationPanel({
  plan,
  strategy,
  setStrategy,
  budget,
  budgetOverride,
  setBudgetOverride,
  summaryCost,
}: {
  /** the reallocation plan computed by the orchestrator from the live profit rows */
  plan: ReallocPlan;
  strategy: ReallocStrategy;
  setStrategy: Dispatch<SetStateAction<ReallocStrategy>>;
  /** the effective budget (override ?? today's cost) shown in the input */
  budget: number;
  budgetOverride: number | null;
  setBudgetOverride: Dispatch<SetStateAction<number | null>>;
  /** today's total ad cost — the "current" baseline the reset button restores */
  summaryCost: number;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  // At least one channel was actually allocated along a fitted curve — the footer must
  // not promise curve math on a plan that ran the constant-ROAS path.
  const curveDriven = plan.rows.some((r) => r.curve?.fitted);

  return (
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
                strategy === value ? "bg-brand-700 text-white" : "text-muted hover:text-navy-700"
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
            {budgetOverride !== null && budgetOverride !== Math.round(summaryCost) && (
              <button
                type="button"
                onClick={() => setBudgetOverride(null)}
                className="ml-1 text-xs font-medium text-muted transition-colors hover:text-navy-700"
              >
                {t("currentBudgetBtn")}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{t("currentCostHint", { cost: fmt.fmtCZKCompact(summaryCost) })}</p>
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

      <ReallocationTable plan={plan} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-muted">
        <span>
          {t(curveDriven ? "reallocationFooterCurve" : "reallocationFooter", {
            allocated: fmt.fmtCZKCompact(plan.allocatedSpend),
            total: fmt.fmtCZKCompact(plan.totalBudget),
          })}
        </span>
        <span>{t("liveHint")}</span>
      </div>
    </div>
  );
}
