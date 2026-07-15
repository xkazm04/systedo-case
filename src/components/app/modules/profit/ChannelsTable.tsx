"use client";

/** Per-channel profit table with editable margins, plus the "unprofitable channels"
 *  warning banner above it. Presentational child of ProfitModule — margin edits flow
 *  up through setMargin (state hook). */

import { Bulb } from "@/components/icons";
import { Pill } from "@/components/ui";
import type { ProfitRow, ProfitSummary } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function ChannelsTable({
  summary,
  rows,
  setMargin,
}: {
  summary: ProfitSummary;
  rows: ProfitRow[];
  setMargin: (channel: string, pct: number) => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
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
    </>
  );
}
