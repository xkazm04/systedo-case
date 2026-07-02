/** Pure, client-side SEO scoring over an already-generated brief result.
 *
 *  This is NOT a change to generation — it reads the existing `BriefResult`
 *  (title / meta / outline / faq / keywords / internalLinks) and derives:
 *    1. a pixel-width estimate for SERP truncation (Google cuts by pixels, not
 *       characters, so a 58-char title can still be clipped), and
 *    2. a small scorecard of readability / keyword-coverage / E-E-A-T chips.
 *
 *  Everything here is deterministic and side-effect-free so it can run during
 *  render and be unit-tested without a DOM.
 */

import type { BriefResult } from "@/lib/ai-types";
import { createFormatters, type SupportedLocale } from "@/lib/format";

// ===========================================================================
// Pixel-width estimation
// ===========================================================================

/** Google renders SERP titles in roughly Arial ~20px (desktop) and meta lines
 *  in ~14px. We can't measure real glyphs without a canvas/DOM, so we use a
 *  per-character advance-width table sampled from Arial at 1px font-size and
 *  scale it by the font size. The table is an APPROXIMATION — proportional
 *  fonts vary by a few percent and kerning is ignored — but it is far closer
 *  to reality than counting characters, which is the whole point: it correctly
 *  flags that wide glyphs (W, M, ž, m) eat the title budget faster than narrow
 *  ones (i, l, í, .).
 *
 *  Values are average advance widths in em units (i.e. fraction of the font
 *  size). Anything not in the table falls back to {@link AVG_CHAR_EM}. */
const CHAR_EM: Readonly<Record<string, number>> = {
  // narrow
  i: 0.22, j: 0.22, l: 0.22, "í": 0.22, "ì": 0.22, "ï": 0.22,
  I: 0.26, t: 0.27, f: 0.27, r: 0.33, "ř": 0.33, "ŕ": 0.33,
  ".": 0.28, ",": 0.28, ":": 0.28, ";": 0.28, "'": 0.19, "|": 0.23,
  "!": 0.28, " ": 0.28, "(": 0.33, ")": 0.33, "[": 0.33, "]": 0.33,
  "-": 0.33, "/": 0.28,
  // medium
  a: 0.56, b: 0.56, c: 0.5, d: 0.56, e: 0.56, g: 0.56, h: 0.56,
  k: 0.5, n: 0.56, o: 0.56, p: 0.56, q: 0.56, s: 0.5, u: 0.56,
  v: 0.5, x: 0.5, y: 0.5, z: 0.5,
  // wide
  m: 0.83, w: 0.72, "ž": 0.5, "š": 0.5, "č": 0.5, "ě": 0.56,
  // digits — Arial digits are roughly uniform
  "0": 0.56, "1": 0.56, "2": 0.56, "3": 0.56, "4": 0.56,
  "5": 0.56, "6": 0.56, "7": 0.56, "8": 0.56, "9": 0.56,
  // uppercase tend to be wider
  A: 0.67, B: 0.67, C: 0.72, D: 0.72, E: 0.67, F: 0.61, G: 0.78,
  H: 0.72, J: 0.5, K: 0.67, L: 0.56, M: 0.83, N: 0.72, O: 0.78,
  P: 0.67, Q: 0.78, R: 0.72, S: 0.67, T: 0.61, U: 0.72, V: 0.67,
  W: 0.94, X: 0.67, Y: 0.67, Z: 0.61,
};

/** Fallback advance width (em) for any character not in {@link CHAR_EM} —
 *  roughly an average lowercase letter. */
export const AVG_CHAR_EM = 0.55;

/** SERP font sizes (px) used by Google for the desktop result. The mobile
 *  layout uses the same title size but a much narrower column, so the width
 *  budget — not the font — is what changes. */
export const SERP_TITLE_PX = 20;
export const SERP_META_PX = 14;

/** Approximate maximum rendered width (px) Google allows before truncating
 *  with an ellipsis. Desktop ~600px, mobile column is much narrower. */
export const SERP_MAX_PX = {
  desktopTitle: 600,
  mobileTitle: 360,
} as const;

/** Estimated rendered width of `text` in pixels at the given font size.
 *  Monotonic in length: appending any character never shrinks the result. */
export function estimateWidthPx(text: string, fontSizePx: number = SERP_TITLE_PX): number {
  let em = 0;
  for (const ch of text) em += CHAR_EM[ch] ?? AVG_CHAR_EM;
  return em * fontSizePx;
}

const ELLIPSIS = "…";

/** Truncate `text` so its estimated rendered width fits within `maxPx`,
 *  appending an ellipsis when (and only when) characters were dropped — exactly
 *  how Google clips a too-wide title/meta. Returns the original string when it
 *  already fits. */
export function truncateToPixels(
  text: string,
  maxPx: number,
  fontSizePx: number = SERP_TITLE_PX
): { text: string; truncated: boolean } {
  if (maxPx <= 0) return { text: "", truncated: text.length > 0 };
  if (estimateWidthPx(text, fontSizePx) <= maxPx) return { text, truncated: false };

  const ellipsisPx = estimateWidthPx(ELLIPSIS, fontSizePx);
  const budget = Math.max(0, maxPx - ellipsisPx);

  let acc = "";
  let width = 0;
  for (const ch of text) {
    const w = (CHAR_EM[ch] ?? AVG_CHAR_EM) * fontSizePx;
    if (width + w > budget) break;
    acc += ch;
    width += w;
  }
  // Drop a trailing space so the ellipsis sits flush against a word.
  acc = acc.replace(/\s+$/, "");
  return { text: acc + ELLIPSIS, truncated: true };
}

// ===========================================================================
// Brief scorecard
// ===========================================================================

export type ChipLevel = "ok" | "warn" | "bad";

export interface ScoreChip {
  /** stable id for React keys / testing */
  id: string;
  level: ChipLevel;
  /** short Czech label */
  label: string;
  /** one-line Czech explanation / fix hint */
  hint: string;
}

export interface BriefScore {
  /** readability signals (sentence/paragraph length) */
  readability: ScoreChip[];
  /** primary-keyword coverage across title / meta / first outline point */
  keywordCoverage: ScoreChip[];
  /** E-E-A-T trust hints (meta length, FAQ depth, keyword set) */
  eeat: ScoreChip[];
  /** overall 0–100 score = share of non-bad chips, lightly penalising warns */
  overall: number;
  /** every chip, flattened — handy for an at-a-glance count */
  all: ScoreChip[];
}

/** Readability thresholds (words per sentence). Plain Czech web copy reads best
 *  around ≤18 words/sentence; >25 starts to feel heavy. */
const SENTENCE_OK = 18;
const SENTENCE_WARN = 25;

/** Split a block of prose into sentences (terminator-based, good enough for a
 *  rough average — abbreviations are rare in titles/meta/outline points). */
function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Average words-per-sentence across the meta description + every outline point
 *  (the prose the brief actually ships). Returns 0 when there is no prose. */
export function avgSentenceLength(brief: BriefResult): number {
  const prose = [
    brief.metaDescription,
    ...brief.outline.flatMap((s) => s.points),
    ...brief.faq.map((f) => f.answer),
  ].filter(Boolean);
  let words = 0;
  let count = 0;
  for (const block of prose) {
    for (const s of sentences(block)) {
      words += wordCount(s);
      count += 1;
    }
  }
  return count === 0 ? 0 : words / count;
}

/** Case-insensitive, accent-insensitive substring match — so "skladování"
 *  matches "Skladovani" and a stray accent doesn't read as a miss. */
function contains(haystack: string, needle: string): boolean {
  const norm = (s: string) =>
    s
      .toLocaleLowerCase("cs")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const n = norm(needle).trim();
  return n.length > 0 && norm(haystack).includes(n);
}

/** Meta length is judged on the same SEO_LIMITS the brief targets. Importing
 *  the constant would couple the helper to the whole ai-types surface for one
 *  number; the Google-recommended range is stable, so we inline it here. */
const META_MIN = 120;
const META_MAX = 155;

/** Score an already-generated brief into green/amber/red chips. Pure.
 *
 *  The primary keyword lives in the BriefRequest (not the result), so it is
 *  passed in separately; an empty/omitted keyword degrades the coverage chips
 *  to "warn" rather than failing them. */
export function scoreBrief(
  brief: BriefResult,
  primaryKeyword: string = "",
  locale: SupportedLocale = "cs"
): BriefScore {
  const kw = primaryKeyword.trim();
  const en = locale === "en";
  // Locale-bound number formatting, so the cs hint says "18,4 slov" (comma
  // decimal) while the en hint says "18.4 words" — not a raw toFixed leak.
  const f = createFormatters(locale);

  // --- readability -------------------------------------------------------
  const avg = avgSentenceLength(brief);
  const longParas = brief.outline
    .map((s) => s.points.filter((p) => wordCount(p) > 40).length)
    .reduce((a, b) => a + b, 0);

  const readability: ScoreChip[] = [
    {
      id: "sentence-length",
      level: avg === 0 ? "warn" : avg <= SENTENCE_OK ? "ok" : avg <= SENTENCE_WARN ? "warn" : "bad",
      label: en ? "Sentence length" : "Délka vět",
      hint: en
        ? avg === 0
          ? "Nothing to measure — no text to evaluate."
          : `Average ${f.fmtDecimal(avg, 1)} words per sentence` +
            (avg <= SENTENCE_OK ? " — easy to read." : avg <= SENTENCE_WARN ? " — consider shorter sentences." : " — sentences are too long.")
        : avg === 0
          ? "Není co měřit — chybí text k vyhodnocení."
          : `Průměr ${f.fmtDecimal(avg, 1)} slov na větu` +
            (avg <= SENTENCE_OK ? " — dobře čitelné." : avg <= SENTENCE_WARN ? " — zvažte kratší věty." : " — věty jsou příliš dlouhé."),
    },
    {
      id: "long-paragraphs",
      level: longParas === 0 ? "ok" : longParas <= 2 ? "warn" : "bad",
      label: en ? "Long paragraphs" : "Dlouhé odstavce",
      hint: en
        ? longParas === 0
          ? "No excessively long outline points."
          : `${longParas} outline point${longParas === 1 ? "" : "s"} longer than 40 words — split them up.`
        : longParas === 0
          ? "Žádné přehnaně dlouhé body osnovy."
          : `${longParas} bodů osnovy je delších než 40 slov — rozdělte je.`,
    },
  ];

  // --- keyword coverage --------------------------------------------------
  const inTitle = !!kw && contains(brief.titleTag, kw);
  const inMeta = !!kw && contains(brief.metaDescription, kw);
  const firstPoint = brief.outline[0]?.heading ?? brief.outline[0]?.points[0] ?? "";
  const inFirst = !!kw && contains(firstPoint, kw);

  const mk = (
    id: string,
    labelCs: string,
    labelEn: string,
    present: boolean,
    whereCs: string,
    whereEn: string
  ): ScoreChip => ({
    id,
    label: en ? labelEn : labelCs,
    level: !kw ? "warn" : present ? "ok" : "bad",
    hint: en
      ? !kw
        ? "No primary keyword provided."
        : present
          ? `Keyword is present ${whereEn}.`
          : `Keyword is missing ${whereEn}.`
      : !kw
        ? "Není zadané hlavní klíčové slovo."
        : present
          ? `Klíčové slovo je ${whereCs}.`
          : `Klíčové slovo chybí ${whereCs}.`,
  });

  const keywordCoverage: ScoreChip[] = [
    mk("kw-title", "Klíčové slovo v title", "Keyword in title", inTitle, "v title tagu", "in the title tag"),
    mk("kw-meta", "Klíčové slovo v meta", "Keyword in meta", inMeta, "v meta popisku", "in the meta description"),
    mk("kw-first", "Klíčové slovo v úvodu", "Keyword in intro", inFirst, "v první sekci osnovy", "in the first outline section"),
  ];

  // --- E-E-A-T -----------------------------------------------------------
  const metaLen = brief.metaDescription.trim().length;
  const metaInRange = metaLen >= META_MIN && metaLen <= META_MAX;
  const faqCount = brief.faq.length;
  const kwCount = brief.keywords.length;

  const eeat: ScoreChip[] = [
    {
      id: "meta-length",
      level: metaInRange ? "ok" : metaLen > META_MAX ? "bad" : "warn",
      label: en ? "Meta description length" : "Délka meta popisku",
      hint: en
        ? metaInRange
          ? `${metaLen} characters — within the ideal range of ${META_MIN}–${META_MAX}.`
          : metaLen > META_MAX
            ? `${metaLen} characters — over ${META_MAX}, Google will clip it.`
            : `${metaLen} characters — too short, aim for ${META_MIN}–${META_MAX}.`
        : metaInRange
          ? `${metaLen} znaků — v ideálním rozsahu ${META_MIN}–${META_MAX}.`
          : metaLen > META_MAX
            ? `${metaLen} znaků — přes ${META_MAX}, Google jej zkrátí.`
            : `${metaLen} znaků — krátké, doplňte do ${META_MIN}–${META_MAX}.`,
    },
    {
      id: "faq-depth",
      level: faqCount >= 2 ? "ok" : faqCount === 1 ? "warn" : "bad",
      label: en ? "FAQ section" : "FAQ sekce",
      hint: en
        ? faqCount >= 2
          ? `${faqCount} questions — supports structured data and E-E-A-T.`
          : faqCount === 1
            ? "Only one question — add more for FAQ schema."
            : "No FAQ — add at least 2 questions."
        : faqCount >= 2
          ? `${faqCount} dotazů — podporuje strukturovaná data a E-E-A-T.`
          : faqCount === 1
            ? "Jen jeden dotaz — přidejte další pro FAQ schema."
            : "Chybí FAQ — přidejte alespoň 2 dotazy.",
    },
    {
      id: "keyword-set",
      level: kwCount >= 5 ? "ok" : kwCount >= 1 ? "warn" : "bad",
      label: en ? "Keyword set" : "Sada klíčových slov",
      hint: en
        ? kwCount >= 5
          ? `${kwCount} keywords cover the topic.`
          : kwCount >= 1
            ? `Only ${kwCount} keyword${kwCount === 1 ? "" : "s"} — expand semantic coverage.`
            : "No keywords to cover the topic."
        : kwCount >= 5
          ? `${kwCount} klíčových slov pokrývá téma.`
          : kwCount >= 1
            ? `Jen ${kwCount} klíčových slov — rozšiřte sémantické pokrytí.`
            : "Chybí klíčová slova k pokrytí tématu.",
    },
  ];

  const all = [...readability, ...keywordCoverage, ...eeat];
  // overall: full credit for "ok", half for "warn", none for "bad".
  const credit = all.reduce((sum, c) => sum + (c.level === "ok" ? 1 : c.level === "warn" ? 0.5 : 0), 0);
  const overall = all.length === 0 ? 0 : Math.round((credit / all.length) * 100);

  return { readability, keywordCoverage, eeat, overall, all };
}
