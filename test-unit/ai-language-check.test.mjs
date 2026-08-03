/** Direction 3 — "the answer is in the project's language".
 *
 *  The system prompt is hardcoded Czech; a non-`cs` locale relies on a LANGUAGE
 *  OVERRIDE appended to the USER prompt, which a weak model (BYOM lets users pick
 *  very cheap ones) can partially ignore. Nothing ever checked the output.
 *
 *  The check is deterministic — no extra model call, no dependency — so the rule is
 *  testable directly. Two failure modes matter, and both are pinned here:
 *
 *    MISS  — Czech prose shipped to an English-locale project goes unflagged.
 *    FALSE POSITIVE — English prose that happens to name Czech brands gets flagged,
 *            which would buy a pointless repair call and then cry wolf in the UI.
 *            This is the one the heuristic is designed around, so it gets the most
 *            fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  czechMarkerCount,
  isProseField,
  languageViolations,
  looksCzech,
  MIN_PROSE_CHARS,
} from "@/lib/llm/language-check";

// ── fixtures ────────────────────────────────────────────────────────────────

/** What a weak model actually does: obeys the English instruction for the short
 *  fields, drifts back to the Czech system prompt for the long prose. */
const CZECH_WHEN_ENGLISH_REQUESTED = {
  headline: "Q3 performance review",
  summary:
    "Výkon kampaní se ve třetím čtvrtletí zlepšil, protože jsme snížili rozpočet u kanálů, " +
    "které dlouhodobě nevydělávaly. Nejsilnější jsou nyní vyhledávací kampaně, zatímco " +
    "displejové sestavy stále nedosahují cílové návratnosti a jejich podíl je vhodné dále snížit.",
  wins: ["Search ROAS up"],
  worstCohort: "2025-01",
};

/** The false-positive trap: genuinely English prose, densely populated with Czech
 *  brand names, localities and diacritics. Must PASS. */
const ENGLISH_WITH_CZECH_BRANDS = {
  summary:
    "Zásilkovna and Rohlík now dominate last-mile delivery in Praha and Brno, while Alza " +
    "keeps its lead on electronics. Košík has grown fastest in Plzeň, and Dámejídlo remains " +
    "the default for restaurant orders across Ostrava and Hradec Králové this quarter.",
  recommendation:
    "Shift the remaining display budget toward branded search on Zboží.cz and Heureka.cz, " +
    "where Kaufland and Lidl are bidding aggressively against Tesco, and revisit the Škoda " +
    "and Kofola partnerships before the Vánoce peak in December each year.",
};

/** Clean English output — the control. */
const ENGLISH_CLEAN = {
  summary:
    "Performance improved through the third quarter after we cut spend on the channels that " +
    "were not paying back. Search now carries the account, while display still falls short of " +
    "the target return and should be reduced further over the coming weeks.",
  recommendation: "Move the display budget into branded search and re-measure in two weeks.",
};

// ── the gate: no-op for cs ──────────────────────────────────────────────────

test("no-op for the default locale", () => {
  assert.deepEqual(languageViolations(CZECH_WHEN_ENGLISH_REQUESTED, "cs"), []);
  assert.deepEqual(languageViolations(CZECH_WHEN_ENGLISH_REQUESTED, undefined), []);
});

// ── the miss it must not have ───────────────────────────────────────────────

test("Czech prose returned for an English-locale project is flagged", () => {
  const violations = languageViolations(CZECH_WHEN_ENGLISH_REQUESTED, "en");
  assert.equal(violations.length, 1, "one actionable violation, not one per field");
  assert.match(violations[0], /entirely in English/);
  assert.match(violations[0], /summary/, "names the offending field so the repair is targeted");
  // The re-prompt instruction is itself in English — it is appended to the repair
  // prompt, and an instruction to write English lands better written in English.
  assert.doesNotMatch(violations[0], /[ěščřžůď]/);
});

test("the violation reaches the model as an ordinary needs-a-model violation", async () => {
  // It must NOT be mistaken for something the deterministic clamp fixes, or the
  // repair would be skipped and the wrong language shipped silently.
  const { partitionViolations } = await import("@/lib/ai/tools/_shared");
  const [violation] = languageViolations(CZECH_WHEN_ENGLISH_REQUESTED, "en");
  assert.deepEqual(partitionViolations([violation]).clampable, []);
  assert.deepEqual(partitionViolations([violation]).needsModel, [violation]);
});

// ── the false positive it must not have ─────────────────────────────────────

test("English prose full of Czech brand names PASSES", () => {
  assert.deepEqual(
    languageViolations(ENGLISH_WITH_CZECH_BRANDS, "en"),
    [],
    "Zásilkovna / Rohlík / Škoda / Plzeň are brands and places, not Czech grammar"
  );
});

test("clean English output PASSES", () => {
  assert.deepEqual(languageViolations(ENGLISH_CLEAN, "en"), []);
});

test("the signal is grammar words, not diacritics", () => {
  // Both strings are long prose; only one is actually Czech.
  assert.equal(czechMarkerCount(ENGLISH_WITH_CZECH_BRANDS.summary), 0);
  assert.ok(czechMarkerCount(CZECH_WHEN_ENGLISH_REQUESTED.summary) >= 2);
});

test("one quoted Czech phrase inside English prose is not enough", () => {
  // A single marker never trips it — two DISTINCT markers are required.
  const mixed = {
    summary:
      "The landing page still opens with the old tagline “doprava zdarma” which nobody on the " +
      "team can explain, and the hero image has not been refreshed since the spring campaign " +
      "launched across every acquisition channel we run today.",
  };
  assert.deepEqual(languageViolations(mixed, "en"), []);
});

// ── the short / structural fields it must never inspect ─────────────────────

test("short fields, enums, slugs and URLs are never inspected", () => {
  const structural = {
    likelyCause: "mis-targeting",
    severity: "high",
    worstCohort: "2025-01",
    slug: "jak-skladovat-orechy-a-seminka-doma-spravne",
    businessName: "Zásilkovna",
    headline: "Ořechy a semínka skladem",
    titleTag: "Jak skladovat ořechy a semínka | Praktický návod",
    url: "https://example.cz/blog/jak-skladovat-orechy-a-seminka",
    channel: "LinkedIn",
    toneOfVoice: "přátelský a věcný",
  };
  assert.deepEqual(
    languageViolations(structural, "en"),
    [],
    "every one of these is below the prose threshold — the check must not guess about them"
  );
  for (const v of Object.values(structural)) assert.equal(isProseField(v), false);
});

test("isProseField needs both real length and a real sentence's worth of words", () => {
  assert.equal(isProseField("x".repeat(MIN_PROSE_CHARS + 20)), false, "one long token");
  assert.equal(isProseField("a b c d e f"), false, "words but far too short");
  assert.equal(
    isProseField("https://example.com/a/very/long/path/that/goes/on?with=query&params=here&more=1"),
    false,
    "a long URL is not prose"
  );
  assert.equal(isProseField(ENGLISH_CLEAN.summary), true);
  assert.equal(isProseField(CZECH_WHEN_ENGLISH_REQUESTED.summary), true);
});

// ── traversal ───────────────────────────────────────────────────────────────

test("nested and array-held prose is inspected too", () => {
  const nested = {
    sections: [
      { heading: "Overview", body: CZECH_WHEN_ENGLISH_REQUESTED.summary },
    ],
  };
  const violations = languageViolations(nested, "en");
  assert.equal(violations.length, 1);
  assert.match(violations[0], /sections\.0\.body/);
});

test("a non-object parse produces no language violation of its own", () => {
  // A truncated parse is already the object-guard's business (and looksCorrupt's);
  // the language check must not pile a second, misleading violation onto it.
  assert.deepEqual(languageViolations(null, "en"), []);
  assert.deepEqual(languageViolations([], "en"), []);
  assert.deepEqual(languageViolations(42, "en"), []);
});

test("looksCzech is the composition of the two gates", () => {
  assert.equal(looksCzech(CZECH_WHEN_ENGLISH_REQUESTED.summary), true);
  assert.equal(looksCzech(ENGLISH_WITH_CZECH_BRANDS.recommendation), false);
  assert.equal(looksCzech("Ořechy a semínka"), false, "too short to judge");
});
