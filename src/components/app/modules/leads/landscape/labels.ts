/** The Krajina canvas's shared vocabulary and palette.
 *
 *  Colours are read as `var(--color-*)` rather than Tailwind utilities because SVG
 *  `fill`/`stroke` attributes take a paint value, not a class — routing them
 *  through the same tokens is what makes the canvas flip with dark mode for free
 *  (docs/design-system.md). No raw hex anywhere in this direction. */
import type { TDict } from "@/lib/i18n/interpolate";
import type { PipelineStage } from "@/lib/leads/types";
import type { SlaPhase } from "@/lib/leads/sla";
import type { LandscapeAxis } from "@/lib/leads/landscape";

export const AXIS_T: TDict<LandscapeAxis> = {
  cs: { source: "Zdroj", stage: "Fáze", region: "Region", owner: "Majitel" },
  en: { source: "Source", stage: "Stage", region: "Region", owner: "Owner" },
};

/** Dot colour = SLA phase. The three live phases are the canvas's whole point;
 *  a settled contact recedes into the navy tint rather than shouting a colour. */
export const SLA_COLOR: Record<SlaPhase, string> = {
  ontrack: "var(--color-brand-500)",
  warning: "var(--color-coral-500)",
  breached: "var(--color-negative)",
  settled: "var(--color-navy-200)",
};

export const SLA_T: TDict<SlaPhase> = {
  cs: { ontrack: "v limitu", warning: "blíží se", breached: "po SLA", settled: "uzavřeno" },
  en: { ontrack: "on track", warning: "closing in", breached: "past SLA", settled: "settled" },
};

/** Ring colour = stage. Ordered the way the funnel is: navy for the early states,
 *  brand for the qualified half, positive/negative for the two ends. */
export const STAGE_COLOR: Record<PipelineStage, string> = {
  new: "var(--color-navy-500)",
  working: "var(--color-coral-500)",
  lead: "var(--color-navy-300)",
  qualified: "var(--color-brand-500)",
  opportunity: "var(--color-brand-700)",
  won: "var(--color-positive)",
  lost: "var(--color-negative)",
  disqualified: "var(--color-navy-100)",
};
