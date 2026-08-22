"use client";

/** Stage move. Moving into a terminal negative asks for a PRESET reason before it
 *  will submit — the API refuses without one, and it refuses on purpose: loss
 *  reasons are counted, and a free-text-only reason produces an unanalysable tally.
 *  The free text rides alongside as an optional note. */
import { useState } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { isTerminalStage, type LostReason, type PipelineStage } from "@/lib/leads/types";
import { ALL_LOST_REASONS, LOST_REASON_T, OPEN_STAGES, STAGE_T, TERMINAL_STAGES } from "./copy";

const T = {
  cs: {
    label: "Posunout fázi",
    reason: "Důvod ztráty",
    save: "Uložit",
    sample: "U ukázkových dat se fáze neukládá.",
  },
  en: {
    label: "Move stage",
    reason: "Loss reason",
    save: "Save",
    sample: "Stage changes are not stored for sample data.",
  },
} as const;

export default function LeadStageControl({
  current,
  disabled,
  onChange,
}: {
  current: PipelineStage;
  disabled: boolean;
  onChange: (stage: string, reason?: string) => Promise<void>;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const reasonT = useT(LOST_REASON_T);
  const [next, setNext] = useState<PipelineStage>(current);
  const [reason, setReason] = useState<LostReason>("no_response");
  const [busy, setBusy] = useState(false);

  const needsReason = isTerminalStage(next);
  const changed = next !== current;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="lead-stage-select">
        {t("label")}
      </label>
      <select
        id="lead-stage-select"
        value={next}
        disabled={disabled}
        onChange={(e) => setNext(e.target.value as PipelineStage)}
        className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-navy-800 disabled:opacity-50"
      >
        {[...OPEN_STAGES, ...TERMINAL_STAGES].map((s) => (
          <option key={s} value={s}>
            {stage(s)}
          </option>
        ))}
      </select>
      {needsReason && (
        <select
          aria-label={t("reason")}
          value={reason}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value as LostReason)}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-navy-800 disabled:opacity-50"
        >
          {ALL_LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {reasonT(r)}
            </option>
          ))}
        </select>
      )}
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || !changed || busy}
        onClick={async () => {
          setBusy(true);
          await onChange(next, needsReason ? reason : undefined);
          setBusy(false);
        }}
      >
        {t("save")}
      </Button>
      {disabled && <span className="text-[11px] text-muted">{t("sample")}</span>}
    </div>
  );
}
