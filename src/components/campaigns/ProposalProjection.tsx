"use client";

/** The NUMBER an operator approves: a pending change-set's forward projection —
 *  before/after ROAS, PNO and conversion value, the projected value and profit
 *  gains, and the two disclosures that keep the number honest (the realized-history
 *  calibration it was tempered by, and the low-confidence label for a shift too
 *  large for a linear estimate).
 *
 *  Extracted from PendingProposal (WP S1) so the approval gate stays small: the
 *  gate is about consent, this is about the estimate. */
import { Info } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import {
  projectedValueGain,
  projectedProfitGain,
  forwardProjectionApplies,
  type ChangeSet,
} from "@/lib/campaigns/control-plane-types";
import { simulationConfidence } from "@/lib/campaigns/simulate";

const T = {
  cs: {
    calibrationPill: "kalibrace ×{m} (z {n} změn)",
    calibrationTitle:
      "Projekce je zmírněná podle toho, co dřívější aplikované balíčky na tomto účtu skutečně" +
      " přinesly (medián realizace/projekce, omezený do rozumného pásma). Uvedeno otevřeně —" +
      " tiše kalibrovaná projekce by byla horší než nekalibrovaná.",
    projectedGain: "Projektovaný přínos ≈",
    projectedProfit: "Projektovaný zisk ≈",
    marginStated: "při marži {m}",
    convValue: "Hodnota",
    linEst: "hodnoty konverzí (lineární odhad).",
    lowConfidence: "Nižší jistota odhadu",
    lowConfidenceTitle:
      "Některý přesun přemísťuje více než polovinu rozpočtu dárce. Lineární odhad je za hranicí" +
      " „malé realokace“ a dopad může být nadhodnocený.",
  },
  en: {
    calibrationPill: "calibrated ×{m} (from {n} change sets)",
    calibrationTitle:
      "The projection is tempered by what earlier applied change sets on this account actually" +
      " delivered (median realized-over-projected, clamped to a plausible band). Stated openly —" +
      " a silently calibrated projection would be worse than an uncalibrated one.",
    projectedGain: "Projected gain ≈",
    projectedProfit: "Projected profit ≈",
    marginStated: "at a {m} margin",
    convValue: "Value",
    linEst: "conversion value (linear estimate).",
    lowConfidence: "Lower-confidence estimate",
    lowConfidenceTitle:
      "A move re-points more than half of its donor's budget. The linear estimate is beyond the" +
      " “small reallocation” it is honest for, so the projected impact may be overstated.",
  },
} as const;

/** WP W2-E — the calibration this set's projection was tempered by. Disclosed,
 *  never silent: the operator approves a number and gets to see the assumption
 *  baked into it. Nothing at all when no calibration applied. */
export function CalibrationPill({ set }: { set: ChangeSet }) {
  const fmt = useFormatters();
  const t = useT(T);
  if (!set.calibration) return null;
  return (
    <p
      className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-navy-50 px-2.5 py-1 text-[11px] font-medium text-muted"
      title={t("calibrationTitle")}
    >
      <Info width={12} height={12} className="shrink-0" />
      {t("calibrationPill", { m: fmt.fmtDecimal(set.calibration.multiplier, 2), n: set.calibration.n })}
    </p>
  );
}

export default function ProposalProjection({
  set,
  money,
}: {
  set: ChangeSet;
  money: (n: number) => string;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  // Direction 1: projected NET PROFIT alongside the value, when the set was scored
  // against the tenant's persisted blended margin — derived from the same value
  // simulation (margin × value gain), with the margin stated.
  const profit = projectedProfitGain(set.simulation, set.marginPct);

  return (
    <>
      {/* A FORWARD projection, only shown while the set is pending/applying
          (forwardProjectionApplies); a reverted set never displays its stale forward
          numbers. The pending block is pending-only, so this is defensive + explicit. */}
      {forwardProjectionApplies(set.status) && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <SimCell label="ROAS" before={fmt.fmtMultiple(set.simulation.before.roas)} after={fmt.fmtMultiple(set.simulation.after.roas)} />
            {/* PNO, not COS: the metric is `simulation.*.pno` and every other surface
                in the app names it PNO (a do-not-translate metric abbreviation, so it
                is identical in both locales). */}
            <SimCell label="PNO" before={fmt.fmtPct(set.simulation.before.pno)} after={fmt.fmtPct(set.simulation.after.pno)} />
            <SimCell label={t("convValue")} before={money(set.simulation.before.conversionValue)} after={money(set.simulation.after.conversionValue)} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("projectedGain")} <strong className="text-navy-700">{money(projectedValueGain(set.simulation))}</strong> {t("linEst")}
          </p>
          {simulationConfidence(set.moves) === "low" && (
            <p
              className="mt-2 inline-flex items-center gap-1.5 rounded-card bg-coral-soft px-3 py-1.5 text-xs font-medium text-coral-600"
              title={t("lowConfidenceTitle")}
            >
              <Info width={14} height={14} className="shrink-0" />
              {t("lowConfidence")}
            </p>
          )}
        </>
      )}
      {profit !== undefined && (
        <p className="mt-1 text-xs text-muted">
          {t("projectedProfit")} <strong className="text-positive">{money(profit)}</strong>{" "}
          <span className="text-muted">{t("marginStated", { m: fmt.fmtPct(set.marginPct!, 0) })}</span>
        </p>
      )}
    </>
  );
}

function SimCell({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-2">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-0.5 text-xs text-muted">
        <span className="tnum">{before}</span>
        <span className="mx-1">→</span>
        <span className="tnum font-semibold text-navy-800">{after}</span>
      </p>
    </div>
  );
}
