"use client";

/** Overhead allocation toggle (#5): allocates fixed overhead by revenue share and
 *  deducts fulfilment per order → true contribution POAS. Presentational child of
 *  ProfitModule — the allocation math (applyOverhead) runs in the state hook. */

import type { Dispatch, SetStateAction } from "react";
import type {
  OverheadOptions,
  OverheadRow,
  OverheadSummary,
  ProfitSummary,
} from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function OverheadPanel({
  overhead,
  setOverhead,
  overheadResult,
  months,
  summary,
}: {
  overhead: OverheadOptions;
  setOverhead: Dispatch<SetStateAction<OverheadOptions>>;
  overheadResult: { rows: OverheadRow[]; summary: OverheadSummary };
  months: number;
  summary: ProfitSummary;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
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
              {/* fmtDecimal, NOT fmtMultiple: overheadMonthsMult already carries the
                  leading "×", so fmtMultiple appended a second one and the line
                  shipped as "× 3,0× měsíce období". The multiplier sign belongs to
                  the copy, the number to the formatter. */}
              <p className="mt-1 text-xs text-muted">{t("overheadMonthsMult", { months: fmt.fmtDecimal(months) })}</p>
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
                        r.contributionProfitable ? "text-positive" : "text-negative"
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
  );
}
