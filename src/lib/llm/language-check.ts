/** Did the model actually answer in the language the project asked for?
 *
 *  Locale fidelity used to be a hope. The system prompt is hardcoded Czech
 *  (src/lib/ai/tools/persona.ts and every tool's own system string), and a non-`cs`
 *  locale relies entirely on a LANGUAGE OVERRIDE line appended to the USER prompt
 *  (see withLanguage in ./index.ts). A strong model obeys it. A weak one — and BYOM
 *  lets a user pick a very cheap one — obeys it for the headline and drifts back to
 *  Czech in the long prose fields. Nothing in _validate.ts / _coerce.ts ever looked.
 *
 *  This is the deterministic check: no extra model call, no new dependency, no
 *  prompt or schema edit (so the golden fingerprints do not re-baseline). A
 *  mismatch is raised as an ordinary violation, which routes it into the wrapper's
 *  existing ONE self-repair re-prompt; if the output is STILL Czech afterwards the
 *  wrapper stamps meta.languageMismatch and the UI says so, instead of silently
 *  shipping the wrong language.
 *
 *  ── THE RULE ────────────────────────────────────────────────────────────────
 *  The app supports exactly two locales (cs, en), and the drift only ever goes one
 *  way: the Czech system prompt bleeding through an English request. So the check
 *  is "does this English-requested answer read as Czech?", and it is built to be
 *  hard to trip by accident:
 *
 *   1. NO-OP for `cs` (and for an absent locale) — nothing to verify.
 *   2. LONG PROSE FIELDS ONLY. A value must be ≥ MIN_PROSE_CHARS and ≥ MIN_PROSE_WORDS
 *      to be inspected at all. That excludes, structurally rather than by guesswork,
 *      every field the heuristic could plausibly get wrong: brand names, business
 *      names, enum values ("mis-targeting", "high"), slugs, keywords, headlines,
 *      CTA copy, title tags, tone descriptors.
 *   3. URLs and whitespace-free values are skipped outright.
 *   4. The signal is CZECH FUNCTION WORDS, not diacritics. Diacritics are exactly
 *      what a legitimate Czech brand name inside English prose carries ("Zásilkovna
 *      doubled its volume"), so keying on them would false-positive on the one case
 *      that must pass. Function words — že, které, není, nebo, jako, protože — appear
 *      only when the sentence GRAMMAR is Czech, and every marker in the list is
 *      checked to not also be an English word.
 *   5. TWO DISTINCT markers are required in one field, so a single quoted Czech
 *      phrase inside an otherwise English paragraph does not trip it either.
 *
 *  Pure + dependency-free, so the rule is unit-tested directly rather than inferred
 *  from a model run. Not an llm-tool (no generateStructured call site). */
import type { SupportedLocale } from "../format";

/** A value shorter than this is never inspected — brand names, enum values, slugs,
 *  headlines, title tags and CTA copy all live below it. */
export const MIN_PROSE_CHARS = 80;
/** …and it must also be a real sentence's worth of words. */
export const MIN_PROSE_WORDS = 12;
/** How many DISTINCT Czech function words make a field "written in Czech". */
export const MIN_DISTINCT_MARKERS = 2;

/** Czech function words that are NOT also English words. Deliberately excludes the
 *  ones that collide with English ("a", "i", "to", "do", "pro", "ale", "on", "my",
 *  "so", "no", "ten") — a false positive here skips nothing and costs a needless
 *  repair call, but a lazily-chosen marker would fire on ordinary English prose.
 *  Grammar words only: no nouns, no brand-adjacent vocabulary. */
const CZECH_MARKERS = [
  "že", "se", "na", "je", "jsou", "jsem", "jsme", "byla", "bylo", "byly", "bude",
  "který", "která", "které", "kterou", "kterých", "kterým",
  "není", "nejsou", "nebo", "jako", "podle", "více", "méně", "však", "také",
  "může", "mohou", "mají", "když", "protože", "aby", "což", "ještě", "proto",
  "díky", "mezi", "takže", "pokud", "nyní", "zde", "tím", "této", "tento", "tato",
  "jejich", "jeho", "vaše", "vašich", "vám", "svůj", "své", "každý", "pouze",
  "vždy", "právě", "další", "např", "např.", "zvýšit", "snížit",
] as const;

const MARKERS = new Set<string>(CZECH_MARKERS);

/** Split into comparable word tokens: lowercased, stripped of surrounding
 *  punctuation. Keeps letters (incl. diacritics) and digits. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Is this string a long prose field — the only kind the check inspects? */
export function isProseField(value: string): boolean {
  const s = value.trim();
  if (s.length < MIN_PROSE_CHARS) return false;
  if (!/\s/.test(s)) return false; // a single long token: slug, id, base64, path
  if (/https?:\/\//i.test(s) && words(s).length < MIN_PROSE_WORDS * 2) return false;
  return words(s).length >= MIN_PROSE_WORDS;
}

/** How many DISTINCT Czech function words a prose field contains. */
export function czechMarkerCount(value: string): number {
  const seen = new Set<string>();
  for (const w of words(value)) if (MARKERS.has(w)) seen.add(w);
  return seen.size;
}

/** Does this long-prose field read as Czech? */
export function looksCzech(value: string): boolean {
  return isProseField(value) && czechMarkerCount(value) >= MIN_DISTINCT_MARKERS;
}

/** Walk a parsed model output and collect `path → value` for every string in it. */
function stringFields(node: unknown, path: string[] = [], out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") {
    out.push([path.join(".") || "(root)", node]);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => stringFields(v, [...path, String(i)], out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) stringFields(v, [...path, k], out);
  }
  return out;
}

/** How the violation reads. Written in the TARGET language on purpose: it is
 *  appended to the repair re-prompt, and an instruction to write English is more
 *  reliably obeyed when it is itself in English. Not part of any system prompt or
 *  schema, so no golden fingerprint moves. */
function languageViolationMessage(fields: string[]): string {
  const list = fields.slice(0, 5).join(", ");
  return (
    `The response must be written entirely in English, but ${fields.length === 1 ? "field" : "fields"} ` +
    `${list} came back in Czech. Rewrite the WHOLE JSON in English, every field and every string value.`
  );
}

/** Deterministic validate-time language check. Returns violations in the usual
 *  `string[]` shape, so the wrapper feeds them straight into its existing single
 *  repair re-prompt — no new code path, no extra model call of its own.
 *
 *  No-op for `cs` and for an absent locale. */
export function languageViolations(parsed: unknown, locale: SupportedLocale | undefined): string[] {
  if (!locale || locale === "cs") return [];
  const offenders = stringFields(parsed)
    .filter(([, value]) => looksCzech(value))
    .map(([path]) => path);
  return offenders.length ? [languageViolationMessage(offenders)] : [];
}
