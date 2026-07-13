"use client";

/** "What if" budget-reallocation simulator: pick a strategy (max-profit /
 *  hold-revenue) and a total budget, and see each channel's suggested spend and
 *  the projected net-profit change. Co-located "use client" child of ProfitModule —
 *  the reallocation math (`reallocateBudget`) runs in the orchestrator; this panel
 *  receives the already-computed `plan` plus the budget/strategy state + setters. */

import type { Dispatch, SetStateAction } from "react";
import type { ReallocPlan, ReallocStrategy } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
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
    colChannel: "Kanál",
    colToday: "Dnes",
    colProposal: "Návrh",
    colChange: "Změna",
    colProfitPerUnit: "Zisk / Kč",
    colProjProfit: "Projekt. zisk",
    reallocationFooter: "Rozděleno {allocated} z {total} · strop 3× dnešní útraty kanálu.",
    liveHint: "Změna marže nebo rozpočtu se promítne živě.",
    currencyUnit: "Kč",
  },
  en: {
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
    colChannel: "Channel",
    colToday: "Today",
    colProposal: "Proposed",
    colChange: "Change",
    colProfitPerUnit: "Profit / unit",
    colProjProfit: "Proj. profit",
    reallocationFooter: "Allocated {allocated} of {total} · capped at 3× today's channel spend.",
    liveHint: "Margin or budget changes apply live.",
    currencyUnit: "USD",
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
  );
}
