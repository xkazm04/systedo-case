/** Learning from the human's pen.
 *
 *  A rejection teaches the twin what NOT to do. But the far more common human act is
 *  quieter: they take a generated reply, fix it, and press send. That edit is a
 *  correction the twin never saw — the old outbox recorded only the final send, and
 *  the difference between what the model wrote and what the human sent was discarded.
 *
 *  This module turns a meaningful edit into an interview-style STYLE FACT — the same
 *  shape an answered gap question banks as — so it shows up in the facts surface and
 *  feeds the next voice distillation. Pure and framework-free (no React, no clock, no
 *  id source — the caller passes `id` and `now`): the two review surfaces (the
 *  free-form outbox and the leads inbox) bank byte-identical facts, and the threshold
 *  unit-tests without a DOM. */
import type { ToneScope, TwinStyleFact } from "./types";

export type EditLocale = "cs" | "en";

/** Split into whitespace-delimited tokens — the unit an edit is measured in. */
function tokenize(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** Levenshtein distance over two token arrays. Word-level rather than char-level:
 *  cheap even on a long reply (the arrays are short) and closer to how a person
 *  perceives an edit — swapping one word is one change, not five characters. */
function tokenLevenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Word-diff ratio in [0,1]: 0 identical, 1 fully rewritten. Pure and symmetric. */
export function editDistanceRatio(before: string, after: string): number {
  const a = tokenize(before);
  const b = tokenize(after);
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return tokenLevenshtein(a, b) / max;
}

/** How much of the reply must change before the edit is worth banking as a lesson.
 *  A quarter of the words: below this it's a typo fix, not a style correction. */
export const EDIT_BANK_THRESHOLD = 0.25;

/** Each side of the before/after pair is clamped to this before storage, so one
 *  fact can't blow past the reply-length budget. */
export const EDIT_SIDE_MAXLEN = 300;

/** Pure decision: did the human change the generated reply enough to teach from?
 *  A whitespace-only edit, an emptied reply, or no real generated original never
 *  banks — only a substantive rewrite of a real draft. */
export function isMeaningfulEdit(
  before: string,
  after: string,
  threshold = EDIT_BANK_THRESHOLD
): boolean {
  const b = before.trim();
  const a = after.trim();
  if (!b || !a || a === b) return false;
  return editDistanceRatio(b, a) >= threshold;
}

const EDIT_FACT_TEXT: Record<EditLocale, { question: string; verb: string }> = {
  cs: { question: "Úprava před odesláním", verb: "Upravil odpověď" },
  en: { question: "Pre-send edit", verb: "Edited the reply" },
};

/** Bank a before/after edit as an interview-style style fact. It carries the same
 *  `source: "interview"` as an answered gap question, so the facts surface renders
 *  it with no special case and the next distillation reads it as training material. */
export function buildEditFact(
  before: string,
  after: string,
  scope: ToneScope,
  locale: EditLocale,
  id: string,
  now: string,
  sideMax = EDIT_SIDE_MAXLEN
): TwinStyleFact {
  const L = EDIT_FACT_TEXT[locale] ?? EDIT_FACT_TEXT.cs;
  const b = before.trim().slice(0, sideMax);
  const a = after.trim().slice(0, sideMax);
  return {
    id,
    scope,
    question: L.question,
    answer: `${L.verb}: „${b}" → „${a}"`,
    source: "interview",
    createdAt: now,
  };
}
