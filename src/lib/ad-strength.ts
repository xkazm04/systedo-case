/** Pure, client-side "Ad Strength" heuristic for the PPC ad generator — a
 *  Google-Ads-style Poor→Excellent rating computed straight from the generated
 *  AdResult. It weights the same things Google's signal does: enough headlines,
 *  how distinct they are, the spread of their lengths, whether the keywords
 *  actually appear in them, enough descriptions and distinct callouts — so the
 *  user can see at a glance whether the set is launch-ready and what is missing.
 *  No network, no API: it only reads what the model already returned. */

import type { AdResult } from "./ai-types";
import type { SupportedLocale } from "@/lib/format";

export type AdStrengthRating = "poor" | "average" | "good" | "excellent";

export const AD_STRENGTH_LABELS: Record<AdStrengthRating, string> = {
  poor: "Slabá",
  average: "Průměrná",
  good: "Dobrá",
  excellent: "Výborná",
};

const AD_STRENGTH_LABELS_EN: Record<AdStrengthRating, string> = {
  poor: "Weak",
  average: "Average",
  good: "Good",
  excellent: "Excellent",
};

/** Weakest → strongest; also the fill order of the segmented meter. */
export const AD_STRENGTH_ORDER: AdStrengthRating[] = ["poor", "average", "good", "excellent"];

export interface AdStrengthFactor {
  label: string;
  status: "pass" | "partial" | "fail";
  /** human, one line: what's there and what would push it higher */
  detail: string;
}

export interface AdStrength {
  /** 0–100 composite */
  score: number;
  rating: AdStrengthRating;
  factors: AdStrengthFactor[];
}

// What Google nudges you toward for a responsive search ad.
const HEADLINE_GOAL = 8;
const HEADLINE_MIN = 5;
const DESC_GOAL = 4;
const DESC_MIN = 2;
const CALLOUT_GOAL = 4;
/** Share of headlines that should carry a keyword (not all — that reads spammy). */
const KEYWORD_COVERAGE_GOAL = 0.5;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Czech count agreement: 1 → one, 2–4 → few, else → many. */
const czPlural = (n: number, one: string, few: string, many: string): string =>
  n === 1 ? one : n >= 2 && n <= 4 ? few : many;

/** Lowercase + strip Czech diacritics & punctuation so "ořechy" matches "orechy". */
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Significant tokens (≥4 chars drops Czech stopwords and stray units like "g"). */
const tokenize = (s: string): string[] => normalize(s).split(" ").filter((w) => w.length >= 4);

const distinctCount = (list: string[]): number =>
  new Set(list.map(normalize).filter(Boolean)).size;

/** Bucket a headline by length the way Google distinguishes short/medium/long. */
const lengthBucket = (len: number): 0 | 1 | 2 => (len <= 15 ? 0 : len <= 24 ? 1 : 2);

const statusFromFraction = (fraction: number): AdStrengthFactor["status"] =>
  fraction >= 0.999 ? "pass" : fraction >= 0.4 ? "partial" : "fail";

export function computeAdStrength(result: AdResult, locale: SupportedLocale = "cs"): AdStrength {
  const headlines = result.headlines.filter((h) => h.trim().length > 0);
  const descriptions = result.descriptions.filter((d) => d.trim().length > 0);
  const callouts = result.callouts.filter((c) => c.trim().length > 0);
  const n = headlines.length;

  // 1 — enough headlines to rotate
  const countFrac = clamp01(n / HEADLINE_GOAL);

  // 2 — distinct headlines (proxy for distinct angles)
  const uniqueHeadlines = distinctCount(headlines);
  const distinctFrac = n ? uniqueHeadlines / n : 0;

  // 3 — spread of headline lengths (short + medium + long reads best everywhere)
  const buckets = new Set(headlines.map((h) => lengthBucket(h.length))).size;
  const spreadFrac = buckets / 3;

  // 4 — keywords actually present in the headlines
  const keywordTokens = Array.from(new Set(result.keywords.flatMap(tokenize)));
  const headlinesWithKeyword = headlines.filter((h) => {
    const ht = new Set(tokenize(h));
    return keywordTokens.some((k) => ht.has(k));
  }).length;
  const coverage = n ? headlinesWithKeyword / n : 0;
  const coverageFrac = clamp01(coverage / KEYWORD_COVERAGE_GOAL);

  // 5 — enough descriptions
  const descFrac = clamp01(descriptions.length / DESC_GOAL);

  // 6 — distinct callouts
  const uniqueCallouts = distinctCount(callouts);
  const calloutFrac = clamp01(uniqueCallouts / CALLOUT_GOAL);

  const en = locale === "en";

  const weighted: { weight: number; frac: number; factor: AdStrengthFactor }[] = [
    {
      weight: 22,
      frac: countFrac,
      factor: {
        label: en ? "Headline count" : "Počet nadpisů",
        status: n >= HEADLINE_GOAL ? "pass" : n >= HEADLINE_MIN ? "partial" : "fail",
        detail: en
          ? n >= HEADLINE_GOAL
            ? `${n} headlines — enough material to rotate combinations.`
            : n >= HEADLINE_MIN
              ? `${n} headlines. Add more (ideally ${HEADLINE_GOAL}+) for more combinations.`
              : `Only ${n} headline${n === 1 ? "" : "s"}. Google recommends at least ${HEADLINE_MIN}.`
          : n >= HEADLINE_GOAL
            ? `${n} nadpisů — dost materiálu pro rotaci kombinací.`
            : n >= HEADLINE_MIN
              ? `${n} nadpisů. Přidejte další (ideálně ${HEADLINE_GOAL}+) pro víc kombinací.`
              : `Jen ${n} ${czPlural(n, "nadpis", "nadpisy", "nadpisů")}. Google doporučuje aspoň ${HEADLINE_MIN}.`,
      },
    },
    {
      weight: 20,
      frac: distinctFrac,
      factor: {
        label: en ? "Unique headlines" : "Unikátní nadpisy",
        status: statusFromFraction(distinctFrac),
        detail: en
          ? uniqueHeadlines === n
            ? `All ${n} headlines are distinct from each other.`
            : `Only ${uniqueHeadlines} of ${n} headlines are unique — rewrite the duplicates.`
          : uniqueHeadlines === n
            ? `Všech ${n} nadpisů je navzájem odlišných.`
            : `Jen ${uniqueHeadlines} z ${n} nadpisů je unikátních — přeformulujte duplicity.`,
      },
    },
    {
      weight: 15,
      frac: spreadFrac,
      factor: {
        label: en ? "Length variety" : "Délková rozmanitost",
        status: buckets >= 3 ? "pass" : buckets === 2 ? "partial" : "fail",
        detail: en
          ? buckets >= 3
            ? "Short and longer headlines — they compose well on mobile and desktop."
            : "Headlines are similar in length. Add noticeably shorter and longer variants."
          : buckets >= 3
            ? "Krátké i delší nadpisy — dobře se skládají na mobilu i desktopu."
            : "Nadpisy mají podobnou délku. Přidejte výrazně kratší i delší varianty.",
      },
    },
    {
      weight: 20,
      frac: coverageFrac,
      factor: {
        label: en ? "Keywords in headlines" : "Klíčová slova v nadpisech",
        status: coverage >= KEYWORD_COVERAGE_GOAL ? "pass" : coverage > 0 ? "partial" : "fail",
        detail: en
          ? coverage >= KEYWORD_COVERAGE_GOAL
            ? `Keywords appear in ${headlinesWithKeyword} of ${n} headlines.`
            : coverage > 0
              ? `Keywords appear in only ${headlinesWithKeyword} of ${n} headlines — include them in more.`
              : "No headline contains a keyword. Include keywords in at least half of them."
          : coverage >= KEYWORD_COVERAGE_GOAL
            ? `Klíčová slova zaznívají v ${headlinesWithKeyword} z ${n} nadpisů.`
            : coverage > 0
              ? `Klíčová slova jsou jen v ${headlinesWithKeyword} z ${n} nadpisů — zařaďte je do dalších.`
              : "Žádný nadpis neobsahuje klíčové slovo. Zařaďte je aspoň do poloviny.",
      },
    },
    {
      weight: 13,
      frac: descFrac,
      factor: {
        label: en ? "Description count" : "Počet popisků",
        status:
          descriptions.length >= DESC_GOAL ? "pass" : descriptions.length >= DESC_MIN ? "partial" : "fail",
        detail: en
          ? descriptions.length >= DESC_GOAL
            ? `${descriptions.length} descriptions cover different arguments.`
            : `${descriptions.length} description${descriptions.length === 1 ? "" : "s"}. Add more to reach ${DESC_GOAL} for full coverage.`
          : descriptions.length >= DESC_GOAL
            ? `${descriptions.length} popisky pokrývají různé argumenty.`
            : `${descriptions.length} ${czPlural(descriptions.length, "popisek", "popisky", "popisků")}. Doplňte na ${DESC_GOAL} pro plné pokrytí.`,
      },
    },
    {
      weight: 10,
      frac: calloutFrac,
      factor: {
        label: en ? "Varied callouts" : "Rozmanité odznaky",
        status: uniqueCallouts >= CALLOUT_GOAL ? "pass" : uniqueCallouts >= 2 ? "partial" : "fail",
        detail: en
          ? uniqueCallouts >= CALLOUT_GOAL
            ? `${uniqueCallouts} distinct callouts extend the ad.`
            : `${uniqueCallouts} callout${uniqueCallouts === 1 ? "" : "s"}. Add more for a longer ad.`
          : uniqueCallouts >= CALLOUT_GOAL
            ? `${uniqueCallouts} odlišných odznaků rozšiřuje inzerát.`
            : `${uniqueCallouts} ${czPlural(uniqueCallouts, "odznak", "odznaky", "odznaků")}. Přidejte další pro delší inzerát.`,
      },
    },
  ];

  const score = Math.round(weighted.reduce((sum, w) => sum + w.weight * w.frac, 0));
  const rating: AdStrengthRating =
    score >= 85 ? "excellent" : score >= 65 ? "good" : score >= 40 ? "average" : "poor";

  return { score, rating, factors: weighted.map((w) => w.factor) };
}

/** Return the localized label for a rating key. */
export function getAdStrengthLabel(rating: AdStrengthRating, locale: SupportedLocale = "cs"): string {
  return locale === "en" ? AD_STRENGTH_LABELS_EN[rating] : AD_STRENGTH_LABELS[rating];
}
