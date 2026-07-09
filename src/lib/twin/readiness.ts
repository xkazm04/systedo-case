/** How ready the twin is to speak for the brand — six milestones, scored 0–100.
 *
 *  Straight port of the personas `useTwinReadiness` idea (six gates, each
 *  complete / partial / empty, score = mean), with the gates retargeted from a
 *  person to a brand: no TTS voice gate and no knowledge-base gate; instead
 *  `grounding` (does the catalog know what this business sells?) and `guardrails`
 *  (has anyone told the twin what it must never say?).
 *
 *  Pure: no clock, no storage, no React. The module renders the ribbon from this;
 *  the gaps drive "what to do next". */
import type { SupportedLocale } from "@/lib/format";
import type { TwinState, ToneScope } from "./types";

export const MILESTONES = ["grounding", "voice", "training", "guardrails", "channels", "activity"] as const;
export type Milestone = (typeof MILESTONES)[number];

export type MilestoneLevel = "complete" | "partial" | "empty";

/** ≥ this many style facts and the twin has enough material to sound like you. */
export const TRAINING_STRONG = 5;
/** ≥ this many do/don't rules and the brand's hard lines are actually written down. */
export const GUARDRAILS_STRONG = 3;

export interface MilestoneState {
  milestone: Milestone;
  level: MilestoneLevel;
}

export interface Readiness {
  score: number;
  milestones: MilestoneState[];
}

const WEIGHT: Record<MilestoneLevel, number> = { complete: 1, partial: 0.5, empty: 0 };

/** Signals the caller resolves outside this module (the catalog lives elsewhere). */
export interface ReadinessInput {
  /** how many offerings the project's catalog holds — the brand grounding */
  offerings: number;
}

function level(complete: boolean, partial: boolean): MilestoneLevel {
  return complete ? "complete" : partial ? "partial" : "empty";
}

/** A voice counts as real only if someone wrote directives into it — an empty row
 *  created by opening the editor must not tick the gate. */
const hasVoice = (state: TwinState, scope: ToneScope): boolean =>
  state.voices.some((v) => v.scope === scope && v.directives.trim().length > 0);

export function deriveReadiness(state: TwinState, input: ReadinessInput): Readiness {
  const channelVoices = state.voices.filter((v) => v.scope !== "generic" && v.directives.trim().length > 0);
  const constraints = state.voices.reduce((n, v) => n + v.constraints.length, 0);
  const enabled = state.channels.filter((c) => c.enabled);
  const decided = state.drafts.filter((d) => d.status === "approved" || d.status === "sent");

  const milestones: MilestoneState[] = [
    // Grounded in the real business, not a blank brand field.
    { milestone: "grounding", level: level(input.offerings >= 3, input.offerings >= 1) },
    // A per-channel voice beats a single generic register.
    { milestone: "voice", level: level(channelVoices.length >= 1, hasVoice(state, "generic")) },
    // Enough real material to distil a voice from.
    { milestone: "training", level: level(state.facts.length >= TRAINING_STRONG, state.facts.length >= 1) },
    { milestone: "guardrails", level: level(constraints >= GUARDRAILS_STRONG, constraints >= 1) },
    { milestone: "channels", level: level(enabled.length >= 1, state.channels.length >= 1) },
    // It has actually done the job at least once.
    { milestone: "activity", level: level(decided.length >= 1, state.drafts.length >= 1) },
  ];

  const sum = milestones.reduce((n, m) => n + WEIGHT[m.level], 0);
  return { score: Math.round((sum / MILESTONES.length) * 100), milestones };
}

/* -------------------------------------------------------------------------- */
/*  Gaps — what to fix next                                                    */
/* -------------------------------------------------------------------------- */

/** Fixed foundation order, used to break ties between equally-severe gaps: there
 *  is no point tuning guardrails before the twin knows what the business sells. */
const PRIORITY: Milestone[] = ["grounding", "voice", "training", "guardrails", "channels", "activity"];

export interface Gap {
  milestone: Milestone;
  level: Exclude<MilestoneLevel, "complete">;
  /** percentage points recovered by completing this milestone */
  delta: number;
}

/** Unmet milestones, worst first: `empty` before `partial`, then foundation order. */
export function buildGaps(readiness: Readiness): Gap[] {
  return readiness.milestones
    .filter((m): m is MilestoneState & { level: Exclude<MilestoneLevel, "complete"> } => m.level !== "complete")
    .map((m) => ({
      milestone: m.milestone,
      level: m.level,
      delta: Math.round(((1 - WEIGHT[m.level]) / MILESTONES.length) * 100),
    }))
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "empty" ? -1 : 1;
      return PRIORITY.indexOf(a.milestone) - PRIORITY.indexOf(b.milestone);
    });
}

/* -------------------------------------------------------------------------- */
/*  Copy                                                                       */
/* -------------------------------------------------------------------------- */

const LABELS: Record<Milestone, { cs: string; en: string }> = {
  grounding: { cs: "Podklady", en: "Grounding" },
  voice: { cs: "Hlas", en: "Voice" },
  training: { cs: "Trénink", en: "Training" },
  guardrails: { cs: "Mantinely", en: "Guardrails" },
  channels: { cs: "Kanály", en: "Channels" },
  activity: { cs: "Provoz", en: "Activity" },
};

const HINTS: Record<Milestone, { cs: string; en: string }> = {
  grounding: {
    cs: "Doplňte katalog — twin musí vědět, co firma nabízí, jinak si to domyslí.",
    en: "Fill in the catalog — the twin must know what the business sells, or it will guess.",
  },
  voice: {
    cs: "Natrénujte hlas alespoň pro jeden kanál, ne jen obecný registr.",
    en: "Train a voice for at least one channel, not just the generic register.",
  },
  training: {
    cs: `Vložte alespoň ${TRAINING_STRONG} ukázek reálné komunikace nebo odpovězte na otázky twinu.`,
    en: `Add at least ${TRAINING_STRONG} real message samples, or answer the twin's questions.`,
  },
  guardrails: {
    cs: `Zapište alespoň ${GUARDRAILS_STRONG} pravidla „vždy / nikdy" — co twin nesmí slíbit.`,
    en: `Write at least ${GUARDRAILS_STRONG} always/never rules — what the twin must never promise.`,
  },
  channels: {
    cs: "Zapněte alespoň jeden kanál a zvolte míru samostatnosti.",
    en: "Enable at least one channel and choose its autonomy level.",
  },
  activity: {
    cs: "Nechte twin napsat první odpověď a schvalte ji.",
    en: "Let the twin draft its first reply and approve it.",
  },
};

export function milestoneLabel(m: Milestone, locale: SupportedLocale): string {
  return locale === "en" ? LABELS[m].en : LABELS[m].cs;
}

export function milestoneHint(m: Milestone, locale: SupportedLocale): string {
  return locale === "en" ? HINTS[m].en : HINTS[m].cs;
}
