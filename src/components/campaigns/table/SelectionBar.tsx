"use client";

import { Bolt, Gauge } from "@/components/icons";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { StageBlockReason } from "@/lib/campaigns/stage-selection";
import type { StageSelection } from "./useStageSelection";
import SelectionPreview from "./SelectionPreview";

const T = {
  cs: {
    selected: "Vybráno: {n}",
    hidden: "(z toho {n} skryto filtrem, do balíčku nepůjdou)",
    preview: "Náhled přesunů",
    previewing: "Sestavuji náhled…",
    stage: "Připravit balíček",
    staging: "Připravuji…",
    stageTitle:
      "Vytvořit JEDEN změnový balíček přesně podle tohoto náhledu v Řízení rozpočtů níže (schválení → vrácení)",
    previewFirst: "Nejdřív si zobrazte náhled přesunů, pak balíček připravte.",
    clear: "Zrušit výběr",
    reasonEmpty: "Všechny vybrané kampaně skrývá aktivní filtr.",
    reasonMixedNetwork:
      "Kampaně z Google Ads a Skliku nemohou být v jednom balíčku. Vyberte kampaně z jedné sítě.",
    reasonReadOnlyNetwork: "Sklik je jen ke čtení: přesuny si můžete prohlédnout, ale ne připravit ke schválení.",
    reasonSample: "Ukázková data si můžete prohlédnout, ale balíček z nich připravit nelze.",
    stale: "Data se od náhledu změnila (proběhla synchronizace). Zobrazte náhled znovu.",
    failed: "Přípravu balíčku se nepodařilo dokončit.",
  },
  en: {
    selected: "{n} selected",
    hidden: "({n} hidden by the filter, not included)",
    preview: "Preview moves",
    previewing: "Building preview…",
    stage: "Stage change set",
    staging: "Staging…",
    stageTitle:
      "Create ONE change set from exactly this preview in Budget management below (approve → revert)",
    previewFirst: "Preview the moves first, then stage them.",
    clear: "Clear selection",
    reasonEmpty: "Every selected campaign is hidden by the active filter.",
    reasonMixedNetwork:
      "Google Ads and Sklik campaigns can't share one change set. Select campaigns from one network.",
    reasonReadOnlyNetwork: "Sklik is read-only: you can preview the moves but not stage them.",
    reasonSample: "Sample data can be previewed, but a change set can't be staged from it.",
    stale: "The data changed since the preview (a sync ran). Preview again.",
    failed: "Couldn't stage the change set.",
  },
} as const;

const REASON_KEY = {
  empty: "reasonEmpty",
  "mixed-network": "reasonMixedNetwork",
  "read-only-network": "reasonReadOnlyNetwork",
  sample: "reasonSample",
} as const satisfies Record<StageBlockReason, keyof (typeof T)["en"]>;

/** The selection's action bar: how many rows the action receives (and how many ticks
 *  sit behind the filter), Preview, then Stage — enabled only once the CURRENT
 *  selection has a preview, so a staged set is always one the operator has seen. */
export default function SelectionBar({ stage, money }: { stage: StageSelection; money: (n: number) => string }) {
  const t = useT(T);
  const { plan, preview, busy, error } = stage;
  const hint = error
    ? error.kind === "stale"
      ? t("stale")
      : (error.message ?? t("failed"))
    : plan.reason
      ? t(REASON_KEY[plan.reason])
      : !preview
        ? t("previewFirst")
        : null;
  return (
    <div className="border-b border-line bg-brand-50/40 px-5 py-3" role="region" aria-label={t("selected", { n: plan.payloadIds.length })}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="tnum text-sm font-semibold text-navy-800">{t("selected", { n: plan.payloadIds.length })}</span>
        {plan.hiddenCount > 0 && <span className="tnum text-xs text-muted">{t("hidden", { n: plan.hiddenCount })}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={stage.clear} disabled={busy !== null}>
            {t("clear")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void stage.previewSelection()} disabled={!plan.canPreview || busy !== null}>
            <Gauge width={14} height={14} className={busy === "preview" ? "animate-pulse" : undefined} />
            {busy === "preview" ? t("previewing") : t("preview")}
          </Button>
          <Button
            size="sm"
            onClick={() => void stage.stageSelection()}
            disabled={!plan.canStage || !preview || busy !== null}
            title={t("stageTitle")}
          >
            <Bolt width={14} height={14} />
            {busy === "stage" ? t("staging") : t("stage")}
          </Button>
        </div>
      </div>
      {hint && (
        <p className={`mt-2 text-xs ${error ? "text-negative" : "text-muted"}`} role={error ? "alert" : undefined}>
          {hint}
        </p>
      )}
      {preview && <SelectionPreview preview={preview} money={money} />}
    </div>
  );
}
