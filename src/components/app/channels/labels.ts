/** Shared bilingual label maps for the channel-lifecycle UI (table, playbook,
 *  pipeline, wizard). Kept as plain data so every channels component renders the
 *  same vocabulary; tones are design-token utility pairs. */
import type {
  ChannelCategory,
  ChannelEffort,
  ChannelMode,
  ChannelStage,
} from "@/lib/organic-channels/types";
import type { ChannelNextKey } from "@/lib/organic-channels/next-step";

type L = { cs: string; en: string };

export const CATEGORY_LABELS: Record<ChannelCategory, L> = {
  directory: { cs: "Katalog", en: "Directory" },
  marketplace: { cs: "Porovnávač", en: "Marketplace" },
  community: { cs: "Komunita", en: "Community" },
  content: { cs: "Obsah", en: "Content" },
  social: { cs: "Sociální síť", en: "Social" },
  pr: { cs: "PR", en: "PR" },
  partnership: { cs: "Partnerství", en: "Partnership" },
};

export const EFFORT_LABELS: Record<ChannelEffort, L & { tone: string }> = {
  low: { cs: "Nízká", en: "Low", tone: "bg-positive-soft text-positive" },
  medium: { cs: "Střední", en: "Medium", tone: "bg-coral-soft text-coral-600" },
  high: { cs: "Vysoká", en: "High", tone: "bg-navy-50 text-navy-700" },
};

export const STAGE_LABELS: Record<ChannelStage, L & { tone: string }> = {
  identified: { cs: "Nalezeno", en: "Identified", tone: "bg-navy-50 text-muted" },
  planned: { cs: "Naplánováno", en: "Planned", tone: "bg-coral-soft text-coral-600" },
  live: { cs: "Běží", en: "Live", tone: "bg-brand-50 text-brand-700" },
  paused: { cs: "Pauza", en: "Paused", tone: "bg-navy-50 text-navy-700" },
  done: { cs: "Hotovo", en: "Done", tone: "bg-positive-soft text-positive" },
};

export const MODE_LABELS: Record<ChannelMode, L & { tone: string }> = {
  manual: { cs: "Ručně", en: "Manual", tone: "bg-navy-50 text-navy-700" },
  twin: { cs: "Dvojče", en: "Twin", tone: "bg-brand-50 text-brand-700" },
};

/** Next-step CTA labels — one per ChannelNextKey ("none" renders nothing). */
export const NEXT_LABELS: Record<Exclude<ChannelNextKey, "none">, L> = {
  decide: { cs: "Nastavit kanál", en: "Set up channel" },
  "train-voice": { cs: "Vytrénovat hlas", en: "Train the voice" },
  "enable-channel": { cs: "Zapnout kanál", en: "Enable the channel" },
  "set-inbox": { cs: "Nastavit schránku", en: "Set up the inbox" },
  "first-action": { cs: "Projít první kroky", en: "Work the first steps" },
  "go-live": { cs: "Spustit", en: "Go live" },
  "check-inbox": { cs: "Zkontrolovat schránku", en: "Check the inbox" },
  "create-content": { cs: "Vytvořit obsah", en: "Create content" },
  "mark-done": { cs: "Označit za hotové", en: "Mark as done" },
  resume: { cs: "Obnovit", en: "Resume" },
};
