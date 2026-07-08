"use client";

import KpiCard from "@/components/dashboard/KpiCard";
import { HEADLINE_METRICS, METRICS, type Bucket, type PeriodResult, type Totals } from "@/lib/metrics";
import type { MetricKey } from "@/lib/types";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    footnoteConvRate: "Konv. poměr {pct}",
    footnoteAov: "AOV {val}",
    footnoteRoas: "ROAS {val}",
    pnoGoalMet: "splněn",
    pnoGoalExceeded: "překročen",
    pnoGoalFmt: "Cíl {pct} {status}",
  },
  en: {
    footnoteConvRate: "Conv. rate {pct}",
    footnoteAov: "AOV {val}",
    footnoteRoas: "ROAS {val}",
    pnoGoalMet: "met",
    pnoGoalExceeded: "exceeded",
    pnoGoalFmt: "Target {pct} {status}",
  },
} as const;

/** The five headline KPI cards. 1 col on small phones, 2 on larger phones, 5 on
 *  desktop. Keyed by period so the values ease in (staggered) on each switch;
 *  each card carries a contextual secondary stat (AOV, ROAS, conv. rate, PNO
 *  vs goal). */
export default function KpiGrid({
  periodKey,
  totals: c,
  result,
  buckets,
  goalPno,
}: {
  periodKey: string;
  totals: Totals;
  result: PeriodResult;
  buckets: Bucket[];
  goalPno: number;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  const footnotes: Record<MetricKey, React.ReactNode> = {
    visits: <>{t("footnoteConvRate", { pct: fmt.fmtPct(c.cr, 2) })}</>,
    cost: <>{t("footnoteRoas", { val: fmt.fmtMultiple(c.roas) })}</>,
    conversions: <>{t("footnoteAov", { val: fmt.fmtCZK(c.aov) })}</>,
    revenue: <>{t("footnoteAov", { val: fmt.fmtCZK(c.aov) })}</>,
    pno: (
      <span className={c.pno <= goalPno ? "text-positive" : "text-coral-600"}>
        {t("pnoGoalFmt", {
          pct: fmt.fmtPct(goalPno, 0),
          status: c.pno <= goalPno ? t("pnoGoalMet") : t("pnoGoalExceeded"),
        })}
      </span>
    ),
    profit: null,
    aov: null,
    cr: null,
    roas: null,
    ctr: null,
    cpc: null,
  };

  return (
    <div
      key={`kpi-${periodKey}`}
      className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-5"
    >
      {HEADLINE_METRICS.map((m, i) => (
        <KpiCard
          key={m}
          meta={METRICS[m]}
          locale={locale}
          value={c[m]}
          delta={result.delta[m]}
          significance={result.significance[m]}
          spark={buckets.map((b) => b[m])}
          footnote={footnotes[m]}
          emphasised={m === "pno"}
          delayMs={i * 55}
        />
      ))}
    </div>
  );
}
