"use client";

/** Margin scenarios (feature #4): save the current per-channel margins under a
 *  name, reload a saved set, and compare two scenarios side by side. Co-located
 *  "use client" child of ProfitModule — the scenario list, its persistence and the
 *  save/load/delete logic live in the orchestrator; this panel receives the
 *  already-computed values + callbacks and only renders the UI. */

import type { Dispatch, SetStateAction } from "react";
import type { MarginScenario, ProfitSummary } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    scenariosTitle: "Scénáře marží",
    scenariosDesc: "Uložte si sadu marží pod názvem a porovnejte dva scénáře vedle sebe.",
    scenarioName: "Název scénáře",
    scenarioPlaceholder: "např. Konzervativní marže",
    saveMargins: "Uložit aktuální marže",
    loadScenario: "Načíst scénář",
    loadScenarioSelect: "Vyberte…",
    compareWith: "Porovnat s",
    compareNone: "Žádný",
    colMetric: "Metrika",
    colCurrentMargin: "Aktuální marže",
    colDiff: "Rozdíl",
    rowNetProfit: "Čistý zisk",
    poas: "POAS",
    rowUnprofitableChannels: "Ztrátové kanály",
    deleteScenario: "Smazat scénář {name}",
  },
  en: {
    scenariosTitle: "Margin scenarios",
    scenariosDesc: "Save a margin set under a name and compare two scenarios side by side.",
    scenarioName: "Scenario name",
    scenarioPlaceholder: "e.g. Conservative margins",
    saveMargins: "Save current margins",
    loadScenario: "Load scenario",
    loadScenarioSelect: "Select…",
    compareWith: "Compare with",
    compareNone: "None",
    colMetric: "Metric",
    colCurrentMargin: "Current margins",
    colDiff: "Difference",
    rowNetProfit: "Net profit",
    poas: "POAS",
    rowUnprofitableChannels: "Unprofitable channels",
    deleteScenario: "Delete scenario {name}",
  },
} as const;

export default function ProfitScenariosPanel({
  scenarioName,
  setScenarioName,
  saveScenario,
  scenarios,
  loadScenario,
  compareId,
  setCompareId,
  deleteScenario,
  compareScenario,
  compareSummary,
  summary,
}: {
  scenarioName: string;
  setScenarioName: Dispatch<SetStateAction<string>>;
  /** persist the current margins under the entered name; `savedAt` is the click epoch */
  saveScenario: (savedAt: number) => void;
  scenarios: MarginScenario[];
  loadScenario: (id: string) => void;
  compareId: string;
  setCompareId: Dispatch<SetStateAction<string>>;
  deleteScenario: (id: string) => void;
  /** the scenario selected for the side-by-side compare, or null */
  compareScenario: MarginScenario | null;
  /** the compare scenario's re-computed summary (null when none selected) */
  compareSummary: ProfitSummary | null;
  /** the live summary the compare table diffs against */
  summary: ProfitSummary;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
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
  );
}
