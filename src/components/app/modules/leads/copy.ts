/** Vocabulary shared by every Leady surface — the stage names, the loss reasons and
 *  the tone each stage wears. Kept in ONE table (rather than a dict per component)
 *  because the queue, the table and the detail pane must never call the same stage
 *  by two different names; `TDict` still makes a key added to one locale column and
 *  not the other a typecheck failure. Framework-free. */
import type { TDict } from "@/lib/i18n/interpolate";
import type { PillTone } from "@/components/ui";
import { PIPELINE_STAGES, LOST_REASONS, type LostReason, type PipelineStage } from "@/lib/leads/types";

export const STAGE_T: TDict<PipelineStage> = {
  cs: {
    new: "Nová",
    working: "V řešení",
    lead: "Lead",
    qualified: "Kvalifikováno",
    opportunity: "Nabídka",
    won: "Vyhráno",
    lost: "Prohráno",
    disqualified: "Vyřazeno",
  },
  en: {
    new: "New",
    working: "Working",
    lead: "Lead",
    qualified: "Qualified",
    opportunity: "Opportunity",
    won: "Won",
    lost: "Lost",
    disqualified: "Disqualified",
  },
};

export const LOST_REASON_T: TDict<LostReason> = {
  cs: {
    price: "Cena",
    timing: "Načasování",
    competitor: "Konkurence",
    no_response: "Bez reakce",
    not_qualified: "Nesplňuje kritéria",
    duplicate: "Duplicita",
    spam: "Spam",
    other: "Jiné",
  },
  en: {
    price: "Price",
    timing: "Timing",
    competitor: "Competitor",
    no_response: "No response",
    not_qualified: "Not qualified",
    duplicate: "Duplicate",
    spam: "Spam",
    other: "Other",
  },
};

/** Stage → chip tone. `won` reads positive, the two terminal negatives read
 *  negative, everything in between stays neutral so the list doesn't shout. */
export const STAGE_TONE: Record<PipelineStage, PillTone> = {
  new: "navy",
  working: "coral",
  lead: "navy",
  qualified: "brand",
  opportunity: "navy",
  won: "positive",
  lost: "negative",
  disqualified: "neutral",
};

/** The stages a human moves a contact through in the UI, in board order. The two
 *  terminal negatives are offered separately because they demand a reason. */
export const OPEN_STAGES: PipelineStage[] = PIPELINE_STAGES.filter(
  (s) => s !== "lost" && s !== "disqualified"
);

export const TERMINAL_STAGES: PipelineStage[] = ["lost", "disqualified"];

export const ALL_LOST_REASONS: LostReason[] = [...LOST_REASONS];
