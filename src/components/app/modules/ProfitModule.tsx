"use client";

import { useMemo, useState } from "react";
import { Bulb } from "@/components/icons";
import { Pill } from "@/components/ui";
import NextSteps from "@/components/app/NextSteps";
import type { ChannelRow } from "@/lib/metrics";
import { computeProfit, reallocateBudget } from "@/lib/profit/compute";
import type { ChannelMargin, ReallocStrategy } from "@/lib/profit/types";
import { fmtCZK, fmtCZKCompact, fmtMultiple, fmtPct } from "@/lib/format";

const PERIOD_LABELS: Record<string, string> = {
  "30": "30 dní",
  "90": "90 dní",
  "365": "12 měsíců",
};

export default function ProfitModule({
  rowsByPeriod,
  defaults,
}: {
  rowsByPeriod: Record<string, ChannelRow[]>;
  defaults: ChannelMargin[];
}) {
  const periods = Object.keys(rowsByPeriod);
  const [period, setPeriod] = useState(periods.includes("90") ? "90" : periods[0]!);
  const [margins, setMargins] = useState<ChannelMargin[]>(defaults);

  const { rows, summary } = useMemo(
    () => computeProfit(rowsByPeriod[period] ?? [], margins),
    [rowsByPeriod, period, margins]
  );

  // "Co kdyby" simulator. Budget defaults to the current total cost (a pure
  // reallocation); `null` tracks the default so a period/margin change re-derives
  // it instead of pinning a stale number. Strategy mirrors the solver toggle.
  const [strategy, setStrategy] = useState<ReallocStrategy>("max-profit");
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null);
  const budget = budgetOverride ?? summary.cost;

  const plan = useMemo(
    () => reallocateBudget(rows, { totalBudget: budget, strategy }),
    [rows, budget, strategy]
  );

  function setMargin(channel: string, pct: number) {
    const clamped = Math.max(0, Math.min(100, pct)) / 100;
    setMargins((ms) => ms.map((m) => (m.channel === channel ? { ...m, marginPct: clamped } : m)));
  }

  const dirty = margins.some(
    (m) => m.marginPct !== defaults.find((d) => d.channel === m.channel)?.marginPct
  );

  const planHelps = plan.profitDelta > 0.5;

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

      {/* summary band */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Čistý zisk z reklamy</p>
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted">POAS</p>
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
