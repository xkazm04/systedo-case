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

/** Above this share of changed words the edit is a rewrite and always banks, as the
 *  whole before/after pair. It is NOT the line between a typo and a style fix: on a
 *  50-word reply a quarter is 13 words, and the corrections that carry a voice — one
 *  adjective, a hedge cut, an added "in our experience of 200 jobs", a new sign-off —
 *  change 1-8. Below it, the edit is judged by what changed, not by how much. */
export const EDIT_BANK_THRESHOLD = 0.25;

/** Each side of the before/after pair is clamped to this before storage, so one
 *  fact can't blow past the reply-length budget. */
export const EDIT_SIDE_MAXLEN = 300;

/** Words of unchanged context kept either side of a changed span when a small edit
 *  is banked, so the fact shows the swap instead of two near-identical replies. */
export const EDIT_SPAN_CONTEXT = 3;

/** What one aligned change is. `cosmetic`: case, diacritics or punctuation only.
 *  `typo`: a near-spelling of the same word. `fact`: a number changed — a grounding
 *  correction, not a style lesson. `voice`: a different word, or words added or cut. */
export type EditOpKind = "cosmetic" | "typo" | "fact" | "voice";

type EditOp = { ai: number; bi: number; removed: string[]; added: string[] };

/** Fold a token to its letters and digits, lowercased, diacritics stripped. */
function fold(w: string): string {
  return w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const isNumeric = (w: string) => /^\d+$/.test(fold(w));

/** Character distance with a transposition counted once ("teh" -> "the" is one slip). */
function charDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Align the two token arrays and return the changed hunks, in reading order. */
function editHunks(a: string[], b: string[]): EditOp[] {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const hunks: EditOp[] = [];
  let open: EditOp | null = null;
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1];
    if (same) {
      open = null;
      i--;
      j--;
      continue;
    }
    if (!open) {
      open = { ai: i, bi: j, removed: [], added: [] };
      hunks.push(open);
    }
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      open.removed.unshift(a[--i]);
      open.added.unshift(b[--j]);
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      open.removed.unshift(a[--i]);
    } else {
      open.added.unshift(b[--j]);
    }
    open.ai = i;
    open.bi = j;
  }
  return hunks.reverse();
}

/** Judge one word swapped for one word by its spelling. */
function classifySwap(from: string, to: string): EditOpKind {
  const x = fold(from);
  const y = fold(to);
  if (x === y) return "cosmetic";
  if (isNumeric(from) && isNumeric(to)) return "fact";
  const len = Math.max(x.length, y.length);
  return len >= 3 && charDistance(x, y) / len <= 0.34 ? "typo" : "voice";
}

const KIND_RANK: Record<EditOpKind, number> = { cosmetic: 0, typo: 1, fact: 2, voice: 3 };

/** Classify one hunk. Words swapped one-for-one are judged pair by pair by spelling
 *  and the hunk takes the strongest kind; a hunk that adds or cuts words is voice
 *  unless every word involved is punctuation or a number. */
export function classifyEdit(removed: string[], added: string[]): EditOpKind {
  const words = [...removed, ...added].filter((w) => fold(w));
  if (words.length === 0) return "cosmetic";
  if (words.every(isNumeric)) return "fact";
  if (removed.length === added.length) {
    return removed
      .map((w, k) => classifySwap(w, added[k]))
      .reduce((a, b) => (KIND_RANK[b] > KIND_RANK[a] ? b : a), "cosmetic" as EditOpKind);
  }
  return "voice";
}

/** Pure decision: did the human change the generated reply in a way worth teaching
 *  from? A rewrite always banks. A smaller edit banks when any hunk is a voice change
 *  — so a typo, a diacritic, a case fix or a corrected price never banks, and one
 *  swapped adjective does. A whitespace-only edit, an emptied reply, or no real
 *  generated original never banks. Known blind spot: a register change spelled like
 *  a typo (Czech colloquial "zvládnem" for "zvládneme") reads as a typo. */
export function isMeaningfulEdit(
  before: string,
  after: string,
  threshold = EDIT_BANK_THRESHOLD
): boolean {
  const b = before.trim();
  const a = after.trim();
  if (!b || !a || a === b) return false;
  if (editDistanceRatio(b, a) >= threshold) return true;
  return editHunks(tokenize(b), tokenize(a)).some(
    (h) => classifyEdit(h.removed, h.added) === "voice"
  );
}

/** Render the voice hunks of a small edit as before/after spans with a little
 *  context, joined by " … ". A distiller handed two 300-character replies that
 *  differ by one word cannot see the word; handed the span, it cannot miss it. */
function editSpans(before: string, after: string, ctx = EDIT_SPAN_CONTEXT): [string, string] {
  const a = tokenize(before);
  const b = tokenize(after);
  const hunks = editHunks(a, b).filter((h) => classifyEdit(h.removed, h.added) === "voice");
  const side = (toks: string[], at: number, mid: string[], lenIn: number) => {
    const lead = toks.slice(Math.max(0, at - ctx), at);
    const tail = toks.slice(at + lenIn, at + lenIn + ctx);
    return [...lead, ...mid, ...tail].join(" ");
  };
  const bs = hunks.map((h) => side(a, h.ai, h.removed, h.removed.length));
  const as = hunks.map((h) => side(b, h.bi, h.added, h.added.length));
  return [bs.join(" … "), as.join(" … ")];
}

const EDIT_FACT_TEXT: Record<EditLocale, { question: string; verb: string }> = {
  cs: { question: "Úprava před odesláním", verb: "Upravil odpověď" },
  en: { question: "Pre-send edit", verb: "Edited the reply" },
};

/** Bank a before/after edit as an interview-style style fact. It carries the same
 *  `source: "interview"` as an answered gap question, so the facts surface renders
 *  it with no special case and the next distillation reads it as training material.
 *  A rewrite banks both whole sides; a smaller edit banks only its changed spans. */
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
  const small = editDistanceRatio(before.trim(), after.trim()) < EDIT_BANK_THRESHOLD;
  const [sb, sa] = small ? editSpans(before, after) : [before.trim(), after.trim()];
  const b = sb.slice(0, sideMax);
  const a = sa.slice(0, sideMax);
  return {
    id,
    scope,
    question: L.question,
    answer: `${L.verb}: „${b}" → „${a}"`,
    source: "interview",
    createdAt: now,
  };
}
