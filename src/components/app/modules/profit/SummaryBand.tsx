"use client";

/** Summary band (#3): net ad profit, POAS, blended margin and unprofitable-channel
 *  count, with period-over-period delta pills. Presentational child of ProfitModule. */

import DeltaBadge from "@/components/dashboard/DeltaBadge";
import type { ProfitSummary } from "@/lib/profit/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function SummaryBand({
  summary,
  netDelta,
  poasDelta,
}: {
  summary: ProfitSummary;
  netDelta: number;
  poasDelta: number;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("netAdProfit")}</p>
          <DeltaBadge delta={netDelta} goodDirection="up" size="xs" />
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
          <DeltaBadge delta={poasDelta} goodDirection="up" size="xs" />
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
  );
}
