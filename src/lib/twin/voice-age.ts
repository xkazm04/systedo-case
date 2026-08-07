/** How old a trained voice is, and whether it's drifted behind its training —
 *  display-only, pure, no clock at module scope (the caller passes `now`).
 *
 *  `voice.updatedAt` was written on every distillation and never read. It is read
 *  here: a voice trained months ago, with a stack of newer style facts banked
 *  since, is a voice worth re-distilling — and a human can only act on that if the
 *  UI says it out loud.
 *
 *  The age phrase mirrors the round-7 `formatMeasuredAge` precedent (llm/quality.ts)
 *  bucket-for-bucket (days < 14 → days, < 60 → weeks, else months, with the Czech
 *  instrumental grammar after „před"), so the two staleness surfaces read the same.
 *
 *  Crucially NOT wired into readiness scoring: the score stays a pure function of
 *  what's been trained, never of what time it is. This is a nudge, not a penalty. */
import type { ToneScope, TwinStyleFact, TwinVoice } from "./types";

/** ≥ this many style facts banked AFTER the voice was trained ⇒ nudge a re-train.
 *  Five is the same bar `TRAINING_STRONG` uses for "enough material to distil". */
export const RETRAIN_MARGIN = 5;

/** Timestamps at or before this are the seed's EPOCH stamp (or otherwise not a real
 *  training event) — an untrained voice, not one trained in 1970. */
const MIN_REAL_TRAINING_MS = Date.UTC(2015, 0, 1);

/** When a voice was actually trained, or null if it never was (seed/epoch stamp,
 *  or a row with no directives — opening the editor must not read as "trained"). */
export function voiceTrainedAt(voice: TwinVoice): string | null {
  if (!voice.directives.trim()) return null;
  const t = Date.parse(voice.updatedAt);
  if (!Number.isFinite(t) || t < MIN_REAL_TRAINING_MS) return null;
  return voice.updatedAt;
}

/** True when ANY voice row was actually trained — the honest "trained twin" bit.
 *  Deliberately NOT `resolveTwin`'s `source`: that flips to "trained" the moment a
 *  row exists (a channel toggle in Správa kanálů is enough), while this asks the
 *  only question the trained-badge should ask — did someone train a voice? The
 *  seed's EPOCH stamp and empty editor drafts don't count (voiceTrainedAt). */
export function hasTrainedVoice(voices: TwinVoice[]): boolean {
  return voices.some((v) => voiceTrainedAt(v) !== null);
}

/** Whole days between an ISO timestamp and `now` (≥ 0; NaN if unparseable). */
export function ageDays(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NaN;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Locale-aware "před 3 měsíci / 3 months ago" for a training timestamp. Returns ""
 *  for an unparseable stamp so the caller can omit the note. Mirrors
 *  `formatMeasuredAge`'s buckets and Czech grammar exactly. */
export function formatVoiceAge(iso: string, locale: "cs" | "en", now: Date = new Date()): string {
  const days = ageDays(iso, now);
  if (!Number.isFinite(days)) return "";
  const cs = locale === "cs";
  if (days < 1) return cs ? "dnes" : "today";

  let n: number;
  let unit: "day" | "week" | "month";
  if (days < 14) {
    n = days;
    unit = "day";
  } else if (days < 60) {
    n = Math.round(days / 7);
    unit = "week";
  } else {
    n = Math.round(days / 30);
    unit = "month";
  }

  if (cs) {
    const w =
      unit === "day"
        ? n === 1
          ? "dnem"
          : "dny"
        : unit === "week"
          ? n === 1
            ? "týdnem"
            : "týdny"
          : n === 1
            ? "měsícem"
            : "měsíci";
    return `před ${n} ${w}`;
  }
  const w = unit === "day" ? "day" : unit === "week" ? "week" : "month";
  return `${n} ${w}${n === 1 ? "" : "s"} ago`;
}

/** Style facts (same scope) banked strictly AFTER the voice was last trained. */
export function factsNewerThanVoice(voice: TwinVoice, facts: TwinStyleFact[]): number {
  const trainedAt = voiceTrainedAt(voice);
  if (trainedAt === null) return 0;
  const t = Date.parse(trainedAt);
  return facts.filter((f) => f.scope === voice.scope && Date.parse(f.createdAt) > t).length;
}

/** Nudge a re-train when a trained voice has fallen behind its material: ≥
 *  `margin` newer facts for its scope. An untrained voice never nudges (the CTA
 *  there is "train it", a different thing). */
export function shouldNudgeRetrain(
  voice: TwinVoice,
  facts: TwinStyleFact[],
  margin: number = RETRAIN_MARGIN
): boolean {
  return factsNewerThanVoice(voice, facts) >= margin;
}

/** Convenience for a channel card: resolve the trained-age note + nudge for a
 *  scope's voice in one call. `null` age when the scope has no trained voice. */
export function voiceAgeFor(
  voices: TwinVoice[],
  facts: TwinStyleFact[],
  scope: ToneScope,
  locale: "cs" | "en",
  now: Date = new Date()
): { trainedAt: string | null; age: string; nudge: boolean } {
  const voice = voices.find((v) => v.scope === scope) ?? null;
  if (!voice) return { trainedAt: null, age: "", nudge: false };
  const trainedAt = voiceTrainedAt(voice);
  return {
    trainedAt,
    age: trainedAt ? formatVoiceAge(trainedAt, locale, now) : "",
    nudge: shouldNudgeRetrain(voice, facts),
  };
}
