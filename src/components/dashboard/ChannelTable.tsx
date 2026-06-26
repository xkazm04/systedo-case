"use client";

import type { ChannelRow, Significance, Totals } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import DeltaBadge from "@/components/dashboard/DeltaBadge";

const T = {
  cs: {
    colChannel: "Kanál",
    colCost: "Náklady",
    colConversions: "Konverze",
    colRevenue: "Obrat",
    colPno: "PNO",
    colRoas: "ROAS",
    colRevenueDelta: "Změna obratu",
    rowTotal: "Celkem",
    revenueDeltaHint: "Δ obratu vs. minulé období",
  },
  en: {
    colChannel: "Channel",
    colCost: "Cost",
    colConversions: "Conversions",
    colRevenue: "Revenue",
    colPno: "PNO",
    colRoas: "ROAS",
    colRevenueDelta: "Revenue change",
    rowTotal: "Total",
    revenueDeltaHint: "Δ revenue vs. previous period",
  },
} as const;

/** Colour PNO relative to the agreed goal: efficient = green, on plan = neutral,
 *  over budget = coral. Organic (cost 0) is treated as fully efficient. */
function pnoTone(pno: number, goal: number): string {
  if (pno <= 0) return "text-positive";
  if (pno <= goal * 1.05) return "text-positive";
  if (pno >= goal * 1.6) return "text-negative";
  return "text-navy-700";
}

export default function ChannelTable({
  rows,
  totals,
  goalPno,
  revenueDelta,
  revenueSignificance,
}: {
  rows: ChannelRow[];
  totals: Totals;
  goalPno: number;
  /** period-over-period revenue change, shown once on the Total footer row */
  revenueDelta?: number;
  /** confidence that the revenue change is real rather than daily noise. Channels
   *  project the totals by a constant share, so a per-channel revenue delta would
   *  equal this aggregate on every row — so it is surfaced only on the Total row,
   *  not as five identical per-channel badges. */
  revenueSignificance?: Significance;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  const maxShare = Math.max(...rows.map((r) => r.revenueShare), 0.0001);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-3 font-semibold">{t("colChannel")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("colCost")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("colConversions")}</th>
              <th className="px-5 py-3 text-right font-semibold">{t("colRevenue")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("colPno")}</th>
              <th className="px-3 py-3 text-right font-semibold">{t("colRoas")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-line/70 last:border-0 hover:bg-canvas/60">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.color }}
                      aria-hidden
                    />
                    <span className="font-medium text-navy-800">{r.channel}</span>
                  </div>
                </td>
                <td className="tnum px-3 py-3 text-right text-navy-700">{fmt.fmtCZK(r.cost)}</td>
                <td className="tnum px-3 py-3 text-right text-navy-700">{fmt.fmtInt(r.conversions)}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-col items-end gap-1">
                    <span className="tnum font-medium text-navy-800">{fmt.fmtCZK(r.revenue)}</span>
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-navy-50">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(r.revenueShare / maxShare) * 100}%`,
                          backgroundColor: r.color,
                        }}
                      />
                    </span>
                  </div>
                </td>
                <td className={`tnum px-3 py-3 text-right font-medium ${pnoTone(r.pno, goalPno)}`}>
                  {r.pno > 0 ? fmt.fmtPct(r.pno) : "—"}
                </td>
                <td className="tnum px-3 py-3 text-right text-navy-700">
                  {r.roas > 0 ? fmt.fmtMultiple(r.roas) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-canvas/50 font-semibold text-navy-800">
              <td className="px-5 py-3">{t("rowTotal")}</td>
              <td className="tnum px-3 py-3 text-right">{fmt.fmtCZK(totals.cost)}</td>
              <td className="tnum px-3 py-3 text-right">{fmt.fmtInt(totals.conversions)}</td>
              <td className="px-5 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className="tnum">{fmt.fmtCZK(totals.revenue)}</span>
                  {revenueDelta !== undefined && (
                    <span className="inline-flex items-center justify-end gap-1.5" title={t("revenueDeltaHint")}>
                      <DeltaBadge
                        delta={revenueDelta}
                        goodDirection="up"
                        size="xs"
                        significance={revenueSignificance}
                      />
                    </span>
                  )}
                </div>
              </td>
              <td className="tnum px-3 py-3 text-right">{fmt.fmtPct(totals.pno)}</td>
              <td className="tnum px-3 py-3 text-right">{fmt.fmtMultiple(totals.roas)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
