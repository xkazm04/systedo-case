import { Gauge } from "@/components/icons";
import type { MonthlyPacing } from "@/lib/metrics";
import {
  fmtCZK,
  fmtCZKCompact,
  fmtMonthLong,
  fmtPct,
  fmtSignedPct,
} from "@/lib/format";

/** Monthly revenue goal pacing + a seasonality-aware month-end forecast.
 *  Mirrors the PNO-vs-goal gauge: a horizontal bar with a goal marker,
 *  colour-coded ahead/behind. The bar shows actual month-to-date (solid) plus
 *  the forecast remainder (lighter), with ticks for the goal and "today's plan". */
export default function GoalPacing({ pacing }: { pacing: MonthlyPacing }) {
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

  return (
    <div className="card animate-fade-up p-5 sm:p-6">
      {/* header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Gauge width={17} height={17} className="text-brand-600" />
          Měsíční cíl obratu
        </div>
        <span className="text-xs text-muted">
          {fmtMonthLong(monthStart)} ·{" "}
          {complete
            ? "měsíc dokončen"
            : `${daysElapsed}/${daysInMonth} dní · zbývá ${daysRemaining}`}
        </span>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* headline + gauge */}
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className="tnum text-3xl font-semibold tracking-tight text-navy-800">
              {fmtCZK(projection)}
            </p>
            <span className={`text-sm font-semibold ${goalTone}`}>
              {fmtPct(attainment, 0)} cíle
            </span>
            {!complete && (
              <span className="text-sm text-muted">
                · {fmtPct(goalProbability, 0)} šance na splnění
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {complete ? "Finální obrat" : "Výhled na konec měsíce"} · cíl{" "}
            {fmtCZKCompact(goal)} ·{" "}
            <span className={goalTone}>
              {overUnder >= 0
                ? `o ${fmtSignedPct(overUnder, 0).replace("+", "")} nad cílem`
                : `${fmtPct(Math.abs(overUnder), 0)} pod cílem`}
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
                title={`Dnešní plán ${fmtCZK(proratedTarget)}`}
              />
            )}
            <div
              className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-navy-700"
              style={{ left: pct(goal) }}
              title={`Cíl ${fmtCZK(goal)}`}
            />
          </div>
          {/* forecast confidence interval (P10–P90) on the same axis as the bar */}
          {!complete && projectionHigh > projectionLow && (
            <div
              className="relative mt-2 h-3"
              title={`Pravděpodobné rozpětí konce měsíce ${fmtCZK(projectionLow)} – ${fmtCZK(projectionHigh)}`}
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
          <p className="mt-2 text-[11px] text-muted">
            Plná barva = obrat zatím{complete ? "" : ", světlá = výhled"}; svislá značka ={" "}
            cíl{complete ? "" : ", tenká = dnešní plán"}
            {complete ? "" : "; tenká čára = pravděpodobné rozpětí (P10–P90)"}.
          </p>
        </div>

        {/* stat tiles */}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-line">
          <Stat
            label="Zatím tento měsíc"
            value={fmtCZK(mtd)}
            sub={`${fmtPct(goal > 0 ? mtd / goal : 0, 0)} cíle`}
          />
          <Stat
            label="Tempo vs. plán"
            value={fmtSignedPct(pace, 0)}
            sub={onPace ? "před plánem" : "za plánem"}
            tone={paceTone}
          />
          <Stat
            label={complete ? "Stav" : "Zbývá dní"}
            value={complete ? "Hotovo" : String(daysRemaining)}
            sub={complete ? "měsíc uzavřen" : `z ${daysInMonth} dní`}
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
      {sub && <dd className="mt-0.5 text-[11px] text-muted">{sub}</dd>}
    </div>
  );
}
