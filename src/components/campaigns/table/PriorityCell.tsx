"use client";

import { severityLabel, triageReasonLabel, type Severity, type TriageResult } from "@/lib/campaigns/triage";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { SourceReadOnlyHint } from "./SourceBadge";

const T = {
  cs: {
    okLabel: "V pořádku",
    okTitle: "Plní cíl",
    severityPillTitle: "Zobrazit nálezy triáže v detailu řádku",
    selectRow: "Vybrat kampaň „{name}“ do změnového balíčku",
  },
  en: {
    okLabel: "On target",
    okTitle: "Meeting goal",
    severityPillTitle: "Show the triage findings in the row detail",
    selectRow: "Select campaign “{name}” for a change set",
  },
} as const;

/** Pill tint per severity (healthy rows render a muted dash instead). */
const SEVERITY_BADGE: Record<Exclude<Severity, "ok">, string> = {
  critical: "bg-negative-soft text-negative",
  warning: "bg-coral-soft text-coral-600",
};

/** The table's first cell: the triage severity, and — on a flagged row when the
 *  caller can stage — the checkbox that adds the row to the change-set selection
 *  (the SelectionBar previews and stages it). Extracted from CampaignTable, which
 *  used to carry a per-row stage button here. */
export default function PriorityCell({
  name,
  tr,
  isOpen,
  onToggleDetail,
  readOnly,
  select,
}: {
  name: string;
  tr: TriageResult;
  isOpen: boolean;
  onToggleDetail: () => void;
  /** ADR-0010 — a critical Sklik row states it is read-only instead of offering a
   *  stage it cannot have (it can still be selected and previewed). */
  readOnly: boolean;
  /** present when a selection can be staged at all (signed in) */
  select?: { checked: boolean; onChange: () => void };
}) {
  const t = useT(T);
  const { locale } = useLocale();
  if (tr.severity === "ok") {
    return (
      <span className="text-muted" title={t("okTitle")} aria-label={t("okLabel")}>
        —
      </span>
    );
  }
  return (
    <div className="flex items-start gap-2">
      {select && (
        <input
          type="checkbox"
          checked={select.checked}
          onChange={select.onChange}
          aria-label={t("selectRow", { name })}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-brand-700"
        />
      )}
      <div className="flex flex-col items-start gap-1.5">
        {/* A button, not a bare pill: the hover-only tooltip left touch users with no
            way to read WHY the row is flagged. Clicking opens the row detail, where
            the same reasons render as a copyable list; the title stays as a
            secondary desktop affordance. */}
        <button
          type="button"
          onClick={onToggleDetail}
          aria-expanded={isOpen}
          className={`pill cursor-pointer transition-shadow hover:shadow-card ${SEVERITY_BADGE[tr.severity]}`}
          title={`${t("severityPillTitle")}\n${tr.reasons.map((r) => `${triageReasonLabel(r, locale)}: ${r.detail}`).join("\n")}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {severityLabel(tr.severity, locale)}
        </button>
        {readOnly && tr.severity === "critical" && <SourceReadOnlyHint />}
      </div>
    </div>
  );
}
