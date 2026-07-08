"use client";

import { Target } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    pnoVsGoal: "PNO vs. cíl",
    goalLabel: "Cíl {pct} (celý web)",
    overGoal: "o {delta} nad cílem",
    onGoal: "v cíli",
    goalMarker: "Cíl {pct}",
    goalMarkerNote: "Svislá značka = cílová hodnota PNO.",
  },
  en: {
    pnoVsGoal: "Cost ratio vs. goal",
    goalLabel: "Target {pct} (entire site)",
    overGoal: "{delta} above target",
    onGoal: "on target",
    goalMarker: "Target {pct}",
    goalMarkerNote: "Vertical marker = PNO target.",
  },
} as const;

/** PNO gauge axis headroom — 60 % above the larger of actual/goal so the bar and
 *  markers never sit at the very edge (matches the channel table's PNO alert band). */
const PNO_GAUGE_HEADROOM = 1.6;

/** The "PNO vs. cíl" side-rail card: the headline ratio, its distance from the
 *  site goal, and a gauge with a target marker. */
export default function PnoGauge({ pno, goalPno }: { pno: number; goalPno: number }) {
  const fmt = useFormatters();
  const t = useT(T);

  const pnoOverGoal = pno > goalPno;
  const gaugeMax = Math.max(pno, goalPno) * PNO_GAUGE_HEADROOM;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
        <Target width={17} height={17} className="text-brand-600" />
        {t("pnoVsGoal")}
      </div>
      <p className="tnum mt-3 text-3xl font-semibold tracking-tight text-navy-800">{fmt.fmtPct(pno)}</p>
      <p className="mt-1 text-sm text-muted">
        {t("goalLabel", { pct: fmt.fmtPct(goalPno, 0) })} ·{" "}
        <span className={pnoOverGoal ? "text-coral-600" : "text-positive"}>
          {pnoOverGoal
            ? t("overGoal", { delta: fmt.fmtSignedPct(pno - goalPno, 1).replace("+", "") })
            : t("onGoal")}
        </span>
      </p>
      <div className="relative mt-4 h-2.5 rounded-full bg-navy-50">
        <div
          className={`h-full rounded-full ${pnoOverGoal ? "bg-coral-500" : "bg-brand-500"}`}
          style={{ width: `${Math.min(100, (pno / gaugeMax) * 100)}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-navy-700"
          style={{ left: `${(goalPno / gaugeMax) * 100}%` }}
          title={t("goalMarker", { pct: fmt.fmtPct(goalPno, 0) })}
        />
      </div>
      <p className="mt-2 text-[13px] text-muted">{t("goalMarkerNote")}</p>
    </div>
  );
}
