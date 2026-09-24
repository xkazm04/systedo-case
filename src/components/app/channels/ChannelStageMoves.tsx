"use client";

/** The playbook's stage-transition block: the lifecycle-legal moves from the
 *  channel's current stage. Decide / go-live flow through the wizard and the
 *  next-step CTA, not here, so an undecided ("identified") channel offers none. */
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import type { ChannelStage } from "@/lib/organic-channels/types";
import { STAGE_LABELS } from "./labels";

const T = {
  cs: { stageSet: "Stav:" },
  en: { stageSet: "Status:" },
} as const;

/** Stage transitions the modal offers per current stage — lifecycle-legal moves only (decide/go-live flow through the wizard + next-step CTA, not here). */
const STAGE_MOVES: Record<ChannelStage, ChannelStage[]> = {
  identified: [],
  planned: ["live", "paused"],
  live: ["paused", "done"],
  paused: ["live", "done"],
  done: ["live"],
};

export default function ChannelStageMoves({
  stage,
  degraded,
  onSetStage,
}: {
  stage: ChannelStage;
  degraded: boolean;
  onSetStage: (stage: ChannelStage) => void;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  if (STAGE_MOVES[stage].length === 0) return null;
  return (
    <div className="rounded-card border border-line bg-canvas px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("stageSet")}</p>
      <div className="flex flex-wrap gap-2">
        {STAGE_MOVES[stage].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => onSetStage(st)}
            disabled={degraded}
            className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-navy-200 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {STAGE_LABELS[st][L]}
          </button>
        ))}
      </div>
    </div>
  );
}
