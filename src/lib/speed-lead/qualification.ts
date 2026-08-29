/** Pure BANT-style qualification scoring for the speed-to-lead inbox. A rep
 *  captures three fields while replying (termín / rozpočet / rozsah) plus a
 *  hot/warm/cold disposition; this rolls those into a 0–100 score and a tone.
 *  No React, no clock reads, no storage — testable in isolation. */
import type { PillTone } from "@/components/ui";
import type { SupportedLocale } from "@/lib/format";

/** How soon the lead wants to realize — the "Timeline" of BANT. */
export type Timeline = "asap" | "weeks" | "exploring" | "unknown";
/** Budget signal — the "Budget" of BANT. */
export type Budget = "confirmed" | "flexible" | "tight" | "unknown";
/** Scope / size of the job — stands in for "Need" + "Authority" here. */
export type Scope = "large" | "medium" | "small" | "unknown";
/** Rep's gut disposition for the lead. "unknown" is the ABSENT state, not a
 *  fourth opinion: it means nobody has judged this lead yet, which is a different
 *  claim from "warm" and must stay tellable apart from it — the AI reply is
 *  grounded on what the rep actually captured. */
export type Disposition = "hot" | "warm" | "cold" | "unknown";

/** Captured qualification for one lead. Every field starts "unknown". */
export interface Qualification {
  timeline: Timeline;
  budget: Budget;
  scope: Scope;
  disposition: Disposition;
}

/** A freshly opened lead carries no answers and a neutral disposition. */
export const EMPTY_QUALIFICATION: Qualification = {
  timeline: "unknown",
  budget: "unknown",
  scope: "unknown",
  disposition: "unknown",
};

/** Each captured field contributes up to ~30 pts; disposition nudges ±10. The
 *  caps keep any single field from dominating and the sum is clamped to 0–100. */
const TIMELINE_POINTS: Record<Timeline, number> = { asap: 30, weeks: 20, exploring: 8, unknown: 0 };
const BUDGET_POINTS: Record<Budget, number> = { confirmed: 30, flexible: 18, tight: 6, unknown: 0 };
const SCOPE_POINTS: Record<Scope, number> = { large: 30, medium: 18, small: 8, unknown: 0 };
const DISPOSITION_POINTS: Record<Disposition, number> = { hot: 10, warm: 0, cold: -10, unknown: 0 };

/** Lightweight 0–100 qualification score. Pure + deterministic. */
export function qualificationScore(q: Qualification): number {
  const raw =
    TIMELINE_POINTS[q.timeline] +
    BUDGET_POINTS[q.budget] +
    SCOPE_POINTS[q.scope] +
    DISPOSITION_POINTS[q.disposition];
  return Math.max(0, Math.min(100, raw));
}

/** How many of the three BANT fields the rep has actually captured. */
export function answeredCount(q: Qualification): number {
  let n = 0;
  if (q.timeline !== "unknown") n += 1;
  if (q.budget !== "unknown") n += 1;
  if (q.scope !== "unknown") n += 1;
  return n;
}

/** Which band a 0–100 score falls in. Spelled like a Disposition, but it is a
 *  DIFFERENT thing: a disposition is the rep's gut call, a band is derived from the
 *  score. They shared a type only because they share three words. */
export type ScoreBand = "hot" | "warm" | "cold";

/** The one place the band thresholds live — tone and label both derive from it,
 *  so a threshold can never be moved in one and forgotten in the other. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 60) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

const BAND_TONES: Record<ScoreBand, PillTone> = {
  hot: "positive",
  warm: "coral",
  cold: "negative",
};

/** Pill tone for a score, mirroring `scoreTone` in LeadQualityModule so the two
 *  qualification surfaces read the same colours. */
export function scoreTone(score: number): PillTone {
  return BAND_TONES[scoreBand(score)];
}

/** Short label per score band, shown beside the Pill. The band is decided by
 *  `scoreBand`, so its NAME lives here too, in both locales. Locale-resolved
 *  through the repo's existing resolver pattern (`severityLabel` in
 *  lib/campaigns/triage.ts) rather than returned as a Czech literal into a
 *  localized panel. */
export const SCORE_LABELS: Record<ScoreBand, string> = {
  hot: "Horký lead",
  warm: "Vlažný lead",
  cold: "Studený lead",
};

export const SCORE_LABELS_EN: Record<ScoreBand, string> = {
  hot: "Hot lead",
  warm: "Warm lead",
  cold: "Cold lead",
};

export function scoreLabel(score: number, locale: SupportedLocale): string {
  const labels = locale === "en" ? SCORE_LABELS_EN : SCORE_LABELS;
  return labels[scoreBand(score)];
}
