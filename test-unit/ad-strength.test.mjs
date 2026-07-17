/** computeAdStrength (src/lib/ad-strength.ts) — keyword-coverage honesty fix.
 *  The ≥4-char token filter drops short Czech heads ("čaj", "med", "bio"), which
 *  used to empty keywordTokens and render a hard "no headline contains a keyword"
 *  fail even when every headline carried the keyword. The fix falls back to
 *  whole-keyword substring matching, and excludes the factor (redistributing its
 *  weight) when there is genuinely nothing to measure. Pure — no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { computeAdStrength } = await import("@/lib/ad-strength");

const mk = (over = {}) => ({
  headlines: [],
  descriptions: [],
  callouts: [],
  keywords: [],
  longHeadline: "",
  rationale: "",
  ...over,
});

const keywordFactor = (s) =>
  s.factors.find((f) => f.label === "Klíčová slova v nadpisech");

test("short keywords: coverage is measured via substring, not falsely failed", () => {
  const s = computeAdStrength(
    mk({
      headlines: ["Bio čaj za akční cenu", "Čaj sypaný", "Med a čaj z farmy", "Sypaný čaj"],
      keywords: ["čaj", "med", "bio"],
    }),
  );
  const kw = keywordFactor(s);
  assert.notEqual(kw.status, "fail", "must not hard-fail when heads contain the keywords");
  assert.equal(kw.status, "pass", "every headline contains a short keyword → full coverage");
  assert.ok(
    !kw.detail.includes("Žádný nadpis neobsahuje"),
    "no false 'no headline contains a keyword' copy",
  );
});

test("no measurable keywords: factor is excluded (partial), weight redistributed", () => {
  const withKw = computeAdStrength(
    mk({
      headlines: ["Prvni nadpis dlouhy", "Druhy nadpis", "Treti", "Ctvrty nadpis navic", "Paty"],
      keywords: [],
    }),
  );
  const kw = keywordFactor(withKw);
  assert.equal(kw.status, "partial", "unmeasurable keyword factor is neutral, not fail");
  assert.ok(kw.detail.toLowerCase().includes("měřiteln"), "explains it was not scored");
  // Excluding the factor must not drag the score below what the measured factors earned.
  assert.ok(withKw.score >= 40, "redistribution keeps a valid set out of 'poor'");
});

test("long keywords still use token matching (regression guard)", () => {
  const s = computeAdStrength(
    mk({
      headlines: ["Ořechy z farmy", "Sušené ořechy", "Ořechy levně", "Bio ořechy"],
      keywords: ["ořechy"],
    }),
  );
  assert.equal(keywordFactor(s).status, "pass");
});

test("score stays within 0..100", () => {
  const s = computeAdStrength(
    mk({
      headlines: ["A", "Bb", "Ccc", "Dddd eeee", "Ffffff gggggg hhhhhh"],
      descriptions: ["one", "two", "three", "four"],
      callouts: ["x", "y", "z", "w"],
      keywords: ["a"],
    }),
  );
  assert.ok(s.score >= 0 && s.score <= 100);
});
