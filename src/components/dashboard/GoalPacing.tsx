"use client";

import { Gauge } from "@/components/icons";
import { daysAheadDisplay, impliedSpendNote, type MonthAttainment, type MonthlyPacing } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./goal-pacing-strings";

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
  const spendNote = impliedSpendNote(pacing);
  // The required pace divides by the days still AHEAD; the days shown must be the same
  // days, and interior days without data are named rather than counted as remaining.
  const daysAhead = daysAheadDisplay(pacing);

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
            : t("dayProgress", { elapsed: daysElapsed, total: daysInMonth, remaining: daysAhead.remaining }) +
              (daysAhead.missing > 0 ? t("dayProgressMissing", { missing: daysAhead.missing }) : "")}
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
                role="img"
                aria-label={t("planTitle", { amount: fmt.fmtCZK(proratedTarget) })}
                title={t("planTitle", { amount: fmt.fmtCZK(proratedTarget) })}
              />
            )}
            <div
              className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-navy-700"
              style={{ left: pct(goal) }}
              role="img"
              aria-label={t("goalTitle", { amount: fmt.fmtCZK(goal) })}
              title={t("goalTitle", { amount: fmt.fmtCZK(goal) })}
            />
          </div>
          {/* forecast confidence interval (P10–P90) on the same axis as the bar */}
          {!complete && projectionHigh > projectionLow && (
            <div
              className="relative mt-2 h-3"
              role="img"
              aria-label={t("ciBandTitle", {
                low: fmt.fmtCZK(projectionLow),
                high: fmt.fmtCZK(projectionHigh),
              })}
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
            value={complete ? t("statDoneValue") : String(daysAhead.remaining)}
            sub={
              complete
                ? t("statDoneSub")
                : daysAhead.missing > 0
                  ? t("statDaysSubMissing", { total: daysInMonth, missing: daysAhead.missing })
                  : t("statDaysSub", { total: daysInMonth })
            }
          />
          {/* the prescription: what the remaining days must average — turns the
              passive forecast into a daily operating target */}
          {showRequired && (
            <Stat
              label={t("statRequiredLabel")}
              value={fmt.fmtCZK(requiredDailyRevenue)}
              sub={t("statRequiredSub", { recent: fmt.fmtCZKCompact(recentDailyRevenue) })}
              tone={requiredDailyRevenue > recentDailyRevenue ? "text-coral-600" : "text-positive"}
              // W1-F carry-forward: the hover said "at current ROAS" even when the number was solved
              // along the fitted RESPONSE CURVE — it now states the basis the footnote below states.
              // The capped curve answer is a floor ("at least"), and a shortfall with no
              // return to price it is unknown — neither may read as "the pace is enough".
              title={
                spendNote === "approx"
                  ? t(pacing.impliedBasis === "curve" ? "statRequiredTitleCurve" : "statRequiredTitle", { spend: fmt.fmtCZKCompact(impliedExtraDailySpend) })
                  : spendNote === "at-least"
                    ? t("statRequiredTitleCurveCap", { spend: fmt.fmtCZKCompact(impliedExtraDailySpend) })
                    : spendNote === "unknown"
                      ? t("statRequiredTitleUnknown")
                      : t("statRequiredTitleOnPace")
              }
            />
          )}
        </dl>
        {showRequired && spendNote !== "none" && (
          <p className="mt-2 text-xs text-muted">
            {t(
              spendNote === "unknown"
                ? "impliedBasisUnknown"
                : spendNote === "at-least"
                  ? "impliedBasisCurveCap"
                  : pacing.impliedBasis === "curve"
                    ? "impliedBasisCurve"
                    : "impliedBasisAverage"
            )}
          </p>
        )}
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
      {/* The prescription behind the number (e.g. the extra daily spend implied)
          lived only in the hover `title`; mirror it to AT so it isn't lost on
          touch/screen readers. */}
      {title && <dd className="sr-only">{title}</dd>}
    </div>
  );
}
