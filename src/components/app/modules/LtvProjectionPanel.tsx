"use client";

/** Interactive LTV projection (feature #3): an adjustable horizon (12 / 24 / 36
 *  months) and a churn-assumption slider that re-run the survival/LTV math live,
 *  with a low/expected/high confidence band from the tail-ratio clamp bounds so
 *  the projection's uncertainty is explicit. Co-located "use client" child of the
 *  server-rendered LtvModule; receives the cohort data + base CAC as props and
 *  reuses the ProfitModule useState + useMemo recompute pattern. */

import { useMemo, useState } from "react";
import { Gauge } from "@/components/icons";
import type { Cohort } from "@/lib/ltv/sample";
import {
  blendedLtvAtRatio,
  ltvProjection,
  LTV_HORIZON,
  LTV_HORIZONS,
  TAIL_RATIO_MAX,
  TAIL_RATIO_MIN,
  type LtvHorizon,
} from "@/lib/ltv/compute";
import { fmtCZK, fmtMultiple, fmtPct } from "@/lib/format";

function ratioTone(r: number): string {
  if (r >= 3) return "text-positive";
  if (r >= 1) return "text-navy-800";
  return "text-negative";
}

/** Slider granularity over the [MIN, MAX] survival-ratio band. */
const RATIO_STEP = 0.01;

export default function LtvProjectionPanel({
  cohorts,
  paidCac,
}: {
  cohorts: Cohort[];
  /** blended paid CAC the band divides by; horizon-independent, server-computed */
  paidCac: number;
}) {
  const [horizon, setHorizon] = useState<LtvHorizon>(LTV_HORIZON as LtvHorizon);
  // null = "use each cohort's own observed decay" (the default expected curve);
  // a number overrides every cohort's tail with one churn assumption.
  const [ratioOverride, setRatioOverride] = useState<number | null>(null);

  // Base band for the chosen horizon: low/expected/high LTV + LTV:CAC. The
  // expected line uses each cohort's own clamped decay (auto) unless overridden.
  const base = useMemo(() => ltvProjection(cohorts, horizon), [cohorts, horizon]);

  // When the slider is engaged, recompute the expected line under that single
  // monthly survival ratio; otherwise fall back to the auto expected value.
  const expectedLtv = useMemo(
    () => (ratioOverride == null ? base.expected : blendedLtvAtRatio(cohorts, horizon, ratioOverride)),
    [ratioOverride, base.expected, cohorts, horizon]
  );
  const expectedRatio = paidCac > 0 ? expectedLtv / paidCac : 0;

  // The slider position: the override, or — at rest — the implied auto ratio
  // derived from the auto expected LTV (kept in band for a sensible start).
  const autoImpliedRatio = useMemo(() => {
    const span = TAIL_RATIO_MAX - TAIL_RATIO_MIN || 1;
    const frac = base.high > base.low ? (base.expected - base.low) / (base.high - base.low) : 0.5;
    return TAIL_RATIO_MIN + Math.min(1, Math.max(0, frac)) * span;
  }, [base.expected, base.low, base.high]);
  const sliderRatio = ratioOverride ?? autoImpliedRatio;
  const churnPct = 1 - sliderRatio;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            <Gauge width={16} height={16} className="shrink-0 text-brand-accent" />
            Projekce LTV s horizontem a pásmem nejistoty
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Horizont i předpoklad odlivu přepočítají LTV i LTV:CAC živě. Pásmo „nízká … vysoká“ plyne
            z mezí extrapolace retenční křivky.
          </p>
        </div>
        <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
          {LTV_HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className={`rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                horizon === h ? "bg-brand-600 text-white" : "text-muted hover:text-navy-700"
              }`}
              aria-pressed={horizon === h}
            >
              {h} měs.
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        {/* expected projection + band */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Očekávané LTV ({horizon} měs.)
          </p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtCZK(expectedLtv)}
          </p>
          <p className="mt-1 text-xs text-muted">
            pásmo {fmtCZK(base.low)} … {fmtCZK(base.high)}
          </p>

          {/* low / expected / high band bar */}
          <div className="mt-3">
            <div className="relative h-2 rounded-full bg-line">
              {base.high > base.low && (
                <span
                  className="absolute top-0 h-2 rounded-full bg-brand-accent/30"
                  style={{ left: "0%", right: "0%" }}
                />
              )}
              <span
                className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-brand-600"
                style={{
                  left:
                    base.high > base.low
                      ? `${Math.min(100, Math.max(0, ((expectedLtv - base.low) / (base.high - base.low)) * 100))}%`
                      : "50%",
                }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>nízká</span>
              <span>očekávaná</span>
              <span>vysoká</span>
            </div>
          </div>
        </div>

        {/* LTV:CAC band */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">LTV : CAC ({horizon} měs.)</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${ratioTone(expectedRatio)}`}>
            {fmtMultiple(expectedRatio)}
          </p>
          <p className="mt-1 text-xs text-muted">
            pásmo {fmtMultiple(base.ltvCacLow)} … {fmtMultiple(base.ltvCacHigh)} · cíl ≥ 3,0×
          </p>
          <p className="mt-3 text-xs text-muted">
            Placené CAC {fmtCZK(paidCac)} se s horizontem nemění — projekce posouvá pouze hodnotu
            zákazníka.
          </p>
        </div>
      </div>

      {/* churn-assumption slider */}
      <div className="border-t border-line px-5 py-4">
        <label htmlFor="ltv-churn" className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-40 shrink-0 text-navy-700">Měsíční odliv (po pozorování)</span>
          <input
            id="ltv-churn"
            type="range"
            min={1 - TAIL_RATIO_MAX}
            max={1 - TAIL_RATIO_MIN}
            step={RATIO_STEP}
            value={churnPct}
            onChange={(e) => setRatioOverride(1 - Number(e.target.value))}
            className="h-1.5 min-w-40 flex-1 cursor-pointer accent-brand-600"
            aria-label="Předpoklad měsíčního odlivu pro extrapolaci retence"
          />
          <span className="tnum w-16 shrink-0 text-right text-navy-800">{fmtPct(churnPct)}</span>
          {ratioOverride != null && (
            <button
              type="button"
              onClick={() => setRatioOverride(null)}
              className="text-xs font-medium text-muted transition-colors hover:text-navy-700"
            >
              Auto
            </button>
          )}
        </label>
        <p className="mt-2 text-xs text-muted">
          Nižší odliv = pomalejší pokles retence = vyšší LTV. „Auto“ drží vlastní pozorovaný pokles
          každé kohorty (mez {fmtPct(1 - TAIL_RATIO_MAX)} … {fmtPct(1 - TAIL_RATIO_MIN)}).
        </p>
      </div>
    </div>
  );
}
