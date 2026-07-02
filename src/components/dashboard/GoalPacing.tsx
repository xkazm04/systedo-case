"use client";

import { Gauge } from "@/components/icons";
import type { MonthAttainment, MonthlyPacing } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    heading: "Měsíční cíl obratu",
    scopeChip: "Tento měsíc",
    monthComplete: "měsíc dokončen",
    dayProgress: "{elapsed}/{total} dní · zbývá {remaining}",
    pctOfGoal: "{pct} cíle",
    chanceLabel: "· {pct} šance na splnění",
    chanceSettling: "· výhled se ustálí po pár dnech",
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
    statRequiredLabel: "Potřebné tempo",
    statRequiredSub: "vs. {recent}/den nyní",
    statRequiredTitle:
      "Průměrný denní obrat, který zbývající dny musí přinést, aby měsíční cíl vyšel. Při současném ROAS to znamená ≈ +{spend}/den výdajů navíc.",
    statRequiredTitleOnPace:
      "Průměrný denní obrat, který zbývající dny musí přinést, aby měsíční cíl vyšel — současné tempo stačí.",
    historyLabel: "Plnění cíle v uzavřených měsících",
    historyHit: "cíl splněn",
    historyMiss: "cíl nesplněn",
    planTitle: "Dnešní plán {amount}",
    goalTitle: "Cíl {amount}",
    ciBandTitle: "Pravděpodobné rozpětí konce měsíce {low} – {high}",
  },
  en: {
    heading: "Monthly revenue target",
    scopeChip: "This month",
    monthComplete: "month complete",
    dayProgress: "{elapsed}/{total} days · {remaining} remaining",
    pctOfGoal: "{pct} of target",
    chanceLabel: "· {pct} chance of hitting target",
    chanceSettling: "· forecast settles after a few days",
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
    statRequiredLabel: "Required pace",
    statRequiredSub: "vs. {recent}/day now",
    statRequiredTitle:
      "Average daily revenue the remaining days must deliver to still hit the monthly target. At the current ROAS that is ≈ +{spend}/day of extra spend.",
    statRequiredTitleOnPace:
      "Average daily revenue the remaining days must deliver to still hit the monthly target — the current pace suffices.",
    historyLabel: "Goal attainment in closed months",
    historyHit: "target met",
    historyMiss: "target missed",
    planTitle: "Today's plan {amount}",
    goalTitle: "Target {amount}",
    ciBandTitle: "Probable month-end range {low} – {high}",
  },
} as const;

/** Monthly revenue goal pacing + a seasonality-aware month-end forecast.
 *  Mirrors the PNO-vs-goal gauge: a horizontal bar with a goal marker,
 *  colour-coded ahead/behind. The bar shows actual month-to-date (solid) plus
 *  the forecast remainder (lighter), with ticks for the goal and "today's plan". */
export default function GoalPacing({
  pacing,
  history,
}: {
  pacing: MonthlyPacing;
  /** month-by-month goal attainment of the last complete months (track record) */
  history?: MonthAttainment[];
}) {
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
    probabilityReliable,
    attainment,
    willHitGoal,
    requiredDailyRevenue,
    recentDailyRevenue,
    impliedExtraDailySpend,
  } = pacing;

  // One axis shared by the fill, the forecast extension and both markers.
  // Gauge axis headroom — 12 % above the largest of goal/projection/mtd so the
  // forecast extension and markers stay inside the track.
  const PACING_GAUGE_HEADROOM = 1.12;
  const gaugeMax = Math.max(goal, projection, mtd) * PACING_GAUGE_HEADROOM;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / gaugeMax) * 100))}%`;

  const overUnder = attainment - 1; // projection vs goal, as a fraction
  const goalTone = willHitGoal ? "text-positive" : "text-coral-600";
  const paceTone = onPace ? "text-positive" : "text-coral-600";

  const gaugeNote = t("gaugeNote", {
    forecastPart: complete ? "" : t("gaugeForecastPart"),
    planPart: complete ? "" : t("gaugePlanPart"),
    ciPart: complete ? "" : t("gaugeCiPart"),
  });

  // Show the required-pace tile whenever days remain AND a goal gap remains —
  // once the goal is banked (required = 0) the tile would be noise.
  const showRequired = !complete && requiredDailyRevenue > 0;

  return (
    <div className="card animate-fade-up p-5 sm:p-6">
      {/* header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Gauge width={17} height={17} className="text-brand-600" />
          {t("heading")}
          {/* Scope cue: the pacing card is fixed to the current calendar month,
              independent of the global period selector — say so to avoid confusion. */}
          <span className="rounded-pill bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-muted">
            {t("scopeChip")}
          </span>
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
            {!complete && probabilityReliable && (
              <span className="text-sm text-muted">
                {t("chanceLabel", { pct: fmt.fmtPct(goalProbability, 0) })}
              </span>
            )}
            {!complete && !probabilityReliable && (
              <span className="text-sm text-muted">{t("chanceSettling")}</span>
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

          {/* track record: hit/miss mini-bars for the last complete months —
              "did we hit goal the last months?" next to "will we hit it now?" */}
          {history && history.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted">{t("historyLabel")}</p>
              <ul className="mt-1.5 flex items-end gap-2">
                {history.map((h) => (
                  <li
                    key={h.month}
                    className="flex flex-col items-center gap-1"
                    title={`${fmt.fmtMonth(h.month)} · ${t("pctOfGoal", {
                      pct: fmt.fmtPct(h.attainment, 0),
                    })} · ${h.hit ? t("historyHit") : t("historyMiss")}`}
                  >
                    <span className="flex h-7 w-5 items-end overflow-hidden rounded-sm bg-navy-50">
                      <span
                        aria-hidden
                        className={`block w-full rounded-sm ${
                          h.hit ? "bg-brand-500" : "bg-coral-500"
                        }`}
                        style={{ height: `${Math.min(100, h.attainment * 100)}%` }}
                      />
                    </span>
                    <span className="text-[10px] text-muted">{fmt.fmtMonth(h.month)}</span>
                    <span className="sr-only">
                      {t("pctOfGoal", { pct: fmt.fmtPct(h.attainment, 0) })} ·{" "}
                      {h.hit ? t("historyHit") : t("historyMiss")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* stat tiles — the required-pace prescription joins the three gauges
            whenever a goal gap remains to be closed (2×2 on small screens) */}
        <dl
          className={`grid grid-cols-1 gap-3 ${
            showRequired ? "sm:grid-cols-2" : "sm:grid-cols-3"
          } lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-line`}
        >
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
          {/* the prescription: what the remaining days must average — turns the
              passive forecast into a daily operating target */}
          {showRequired && (
            <Stat
              label={t("statRequiredLabel")}
              value={fmt.fmtCZK(requiredDailyRevenue)}
              sub={t("statRequiredSub", { recent: fmt.fmtCZKCompact(recentDailyRevenue) })}
              tone={requiredDailyRevenue > recentDailyRevenue ? "text-coral-600" : "text-positive"}
              title={
                impliedExtraDailySpend >= 1
                  ? t("statRequiredTitle", { spend: fmt.fmtCZKCompact(impliedExtraDailySpend) })
                  : t("statRequiredTitleOnPace")
              }
            />
          )}
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
  title,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  /** optional hover explanation for the tile */
  title?: string;
}) {
  return (
    <div className="lg:py-2.5 lg:first:pt-0 lg:last:pb-0" title={title}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tnum mt-1 text-lg font-semibold ${tone}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-[13px] text-muted">{sub}</dd>}
    </div>
  );
}
