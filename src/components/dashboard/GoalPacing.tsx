"use client";

import { Gauge } from "@/components/icons";
import type { MonthlyPacing } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Měsíční cíl obratu",
    monthComplete: "měsíc dokončen",
    dayProgress: "{elapsed}/{total} dní · zbývá {remaining}",
    pctOfGoal: "{pct} cíle",
    chanceLabel: "· {pct} šance na splnění",
    finalRevenue: "Finální obrat",
    forecast: "Výhled na konec měsíce",
    goalSuffix: "· cíl {amount}",
    overGoal: "o {pct} nad cílem",
    belowGoal: "{pct} pod cílem",
    gaugeNote: "Plná barva = obrat zatím{forecastPart}; svislá značka = cíl{planPart}{ciPart}.",
    gaugeForecastPart: ", světlá = výhled",
    gaugePlanPart: ", tenká = dnešní plán",
    gaugeCiPart: "; tenká čára = pravděpodobné rozpětí (P10–P90)",
    statMtdLabel: "Zatím tento měsíc",
    statMtdSub: "{pct} cíle",
    statPaceLabel: "Tempo vs. plán",
    statPaceAhead: "před plánem",
    statPaceBehind: "za plánem",
    statDaysLabel: "Zbývá dní",
    statDoneLabel: "Stav",
    statDoneValue: "Hotovo",
    statDoneSub: "měsíc uzavřen",
    statDaysSub: "z {total} dní",
    planTitle: "Dnešní plán {amount}",
    goalTitle: "Cíl {amount}",
    ciBandTitle: "Pravděpodobné rozpětí konce měsíce {low} – {high}",
  },
  en: {
    heading: "Monthly revenue target",
    monthComplete: "month complete",
    dayProgress: "{elapsed}/{total} days · {remaining} remaining",
    pctOfGoal: "{pct} of target",
    chanceLabel: "· {pct} chance of hitting target",
    finalRevenue: "Final revenue",
    forecast: "Month-end forecast",
    goalSuffix: "· target {amount}",
    overGoal: "{pct} above target",
    belowGoal: "{pct} below target",
    gaugeNote: "Solid = revenue to date{forecastPart}; vertical marker = target{planPart}{ciPart}.",
    gaugeForecastPart: ", light = forecast",
    gaugePlanPart: ", thin = today's plan",
    gaugeCiPart: "; thin line = probable range (P10–P90)",
    statMtdLabel: "Month to date",
    statMtdSub: "{pct} of target",
    statPaceLabel: "Pace vs. plan",
    statPaceAhead: "ahead of plan",
    statPaceBehind: "behind plan",
    statDaysLabel: "Days remaining",
    statDoneLabel: "Status",
    statDoneValue: "Done",
    statDoneSub: "month closed",
    statDaysSub: "of {total} days",
    planTitle: "Today's plan {amount}",
    goalTitle: "Target {amount}",
    ciBandTitle: "Probable month-end range {low} – {high}",
  },
} as const;

/** Monthly revenue goal pacing + a seasonality-aware month-end forecast.
 *  Mirrors the PNO-vs-goal gauge: a horizontal bar with a goal marker,
 *  colour-coded ahead/behind. The bar shows actual month-to-date (solid) plus
 *  the forecast remainder (lighter), with ticks for the goal and "today's plan". */
export default function GoalPacing({ pacing }: { pacing: MonthlyPacing }) {
  const fmt = useFormatters();
  const t = useT(T);

  const {
    monthStart,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    complete,
    goal,
    mtd,
    proratedTarget,
    pace,
    onPace,
    projection,
    projectionLow,
    projectionHigh,
    goalProbability,
    attainment,
    willHitGoal,
  } = pacing;

  // One axis shared by the fill, the forecast extension and both markers.
  const gaugeMax = Math.max(goal, projection, mtd) * 1.12;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / gaugeMax) * 100))}%`;

  const overUnder = attainment - 1; // projection vs goal, as a fraction
  const goalTone = willHitGoal ? "text-positive" : "text-coral-600";
  const paceTone = onPace ? "text-positive" : "text-coral-600";

  const gaugeNote = t("gaugeNote", {
    forecastPart: complete ? "" : t("gaugeForecastPart"),
    planPart: complete ? "" : t("gaugePlanPart"),
    ciPart: complete ? "" : t("gaugeCiPart"),
  });

  return (
    <div className="card animate-fade-up p-5 sm:p-6">
      {/* header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Gauge width={17} height={17} className="text-brand-600" />
          {t("heading")}
        </div>
        <span className="text-xs text-muted">
          {fmt.fmtMonthLong(monthStart)} ·{" "}
          {complete
            ? t("monthComplete")
            : t("dayProgress", { elapsed: daysElapsed, total: daysInMonth, remaining: daysRemaining })}
        </span>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* headline + gauge */}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className="tnum text-3xl font-semibold tracking-tight text-navy-800">
              {fmt.fmtCZK(projection)}
            </p>
            <span className={`text-sm font-semibold ${goalTone}`}>
              {t("pctOfGoal", { pct: fmt.fmtPct(attainment, 0) })}
            </span>
            {!complete && (
              <span className="text-sm text-muted">
                {t("chanceLabel", { pct: fmt.fmtPct(goalProbability, 0) })}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {complete ? t("finalRevenue") : t("forecast")}{" "}
            {t("goalSuffix", { amount: fmt.fmtCZKCompact(goal) })} ·{" "}
            <span className={goalTone}>
              {overUnder >= 0
                ? t("overGoal", { pct: fmt.fmtSignedPct(overUnder, 0).replace("+", "") })
                : t("belowGoal", { pct: fmt.fmtPct(Math.abs(overUnder), 0) })}
            </span>
          </p>

          {/* gauge: solid = MTD, lighter = forecast remainder, ticks = plan + goal */}
          <div className="relative mt-5 h-2.5 rounded-full bg-navy-50">
            {!complete && projection > mtd && (
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${
                  onPace ? "bg-brand-500/25" : "bg-coral-500/25"
                }`}
                style={{ width: pct(projection) }}
              />
            )}
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${
                onPace ? "bg-brand-500" : "bg-coral-500"
              }`}
              style={{ width: pct(mtd) }}
            />
            {!complete && (
              <div
                className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-full bg-navy-300"
                style={{ left: pct(proratedTarget) }}
                title={t("planTitle", { amount: fmt.fmtCZK(proratedTarget) })}
              />
            )}
            <div
              className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-navy-700"
              style={{ left: pct(goal) }}
              title={t("goalTitle", { amount: fmt.fmtCZK(goal) })}
            />
          </div>
          {/* forecast confidence interval (P10–P90) on the same axis as the bar */}
          {!complete && projectionHigh > projectionLow && (
            <div
              className="relative mt-2 h-3"
              title={t("ciBandTitle", {
                low: fmt.fmtCZK(projectionLow),
                high: fmt.fmtCZK(projectionHigh),
              })}
            >
              <div
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-navy-200"
                style={{
                  left: pct(projectionLow),
                  width: `calc(${pct(projectionHigh)} - ${pct(projectionLow)})`,
                }}
              />
              <div
                className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-400 ring-2 ring-surface"
                style={{ left: pct(projection) }}
              />
            </div>
          )}
          <p className="mt-2 text-[13px] text-muted">{gaugeNote}</p>
        </div>

        {/* stat tiles */}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-line">
          <Stat
            label={t("statMtdLabel")}
            value={fmt.fmtCZK(mtd)}
            sub={t("statMtdSub", { pct: fmt.fmtPct(goal > 0 ? mtd / goal : 0, 0) })}
          />
          <Stat
            label={t("statPaceLabel")}
            value={fmt.fmtSignedPct(pace, 0)}
            sub={onPace ? t("statPaceAhead") : t("statPaceBehind")}
            tone={paceTone}
          />
          <Stat
            label={complete ? t("statDoneLabel") : t("statDaysLabel")}
            value={complete ? t("statDoneValue") : String(daysRemaining)}
            sub={complete ? t("statDoneSub") : t("statDaysSub", { total: daysInMonth })}
          />
        </dl>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "text-navy-800",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="lg:py-2.5 lg:first:pt-0 lg:last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tnum mt-1 text-lg font-semibold ${tone}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-[13px] text-muted">{sub}</dd>}
    </div>
  );
}
