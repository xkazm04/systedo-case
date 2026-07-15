"use client";

/** Reconciliation note (Direction 2): shown only when a report model exists AND this
 *  module's blended margin diverges from it by ≥ threshold p.b. (the caller gates on
 *  that). Both numbers are stated; the fix is the "apply to report" button above. */

import { Bulb } from "@/components/icons";
import type { MarginDivergence } from "@/lib/profit/reconcile";
import { useFormatters, useT } from "@/lib/i18n/client";
import { T } from "./strings";

export default function ReconcileNote({ reconcile }: { reconcile: MarginDivergence }) {
  const fmt = useFormatters();
  const t = useT(T);

  return (
    <div className="flex items-start gap-3 rounded-card border border-coral-200 bg-coral-soft/40 px-4 py-3 text-xs leading-relaxed text-navy-700">
      <Bulb width={16} height={16} className="mt-0.5 shrink-0 text-coral-600" />
      <span>
        {t("reconcileNote", {
          computed: fmt.fmtPct(reconcile.computedMargin, 0),
          persisted: fmt.fmtPct(reconcile.persistedMargin, 0),
          delta: String(Math.abs(reconcile.deltaPp)),
          apply: t("applyUpdate"),
        })}
      </span>
    </div>
  );
}
