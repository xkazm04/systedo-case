/** Unit tests for the speed-to-lead qualification scoring and reply-snippet
 *  placeholder expansion. Runs the TS source directly via the shared resolve
 *  hook (node --import ./test-llm/setup.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_QUALIFICATION,
  qualificationScore,
  answeredCount,
  scoreTone,
  scoreLabel,
} from "@/lib/speed-lead/qualification";
import {
  expandSnippet,
  snippetVarsFor,
  coerceSnippets,
  DEFAULT_SNIPPETS,
} from "@/lib/speed-lead/snippets";

test("empty qualification scores 0, is cold, and counts no answered fields", () => {
  assert.equal(qualificationScore(EMPTY_QUALIFICATION), 0);
  assert.equal(answeredCount(EMPTY_QUALIFICATION), 0);
  assert.equal(scoreTone(0), "negative");
  assert.equal(scoreLabel(0), "Studený lead");
});

test("qualificationScore sums field weights + disposition and clamps to 0–100", () => {
  // 30 + 30 + 30 + 10 = 100 (max), clamped (would be 100 exactly here).
  assert.equal(
    qualificationScore({ timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" }),
    100,
  );
  // 20 + 18 + 18 + 0 = 56.
  assert.equal(
    qualificationScore({ timeline: "weeks", budget: "flexible", scope: "medium", disposition: "warm" }),
    56,
  );
  // cold with no fields → -10 clamped up to 0.
  assert.equal(
    qualificationScore({ timeline: "unknown", budget: "unknown", scope: "unknown", disposition: "cold" }),
    0,
  );
  assert.equal(
    answeredCount({ timeline: "asap", budget: "tight", scope: "unknown", disposition: "warm" }),
    2,
  );
});

test("scoreTone / scoreLabel band on 40 and 60 thresholds", () => {
  assert.equal(scoreTone(60), "positive");
  assert.equal(scoreTone(59), "coral");
  assert.equal(scoreTone(40), "coral");
  assert.equal(scoreTone(39), "negative");
  assert.equal(scoreLabel(60), "Horký lead");
  assert.equal(scoreLabel(40), "Vlažný lead");
  assert.equal(scoreLabel(39), "Studený lead");
});

test("snippetVarsFor pulls first name + channel label from a lead", () => {
  const vars = snippetVarsFor({
    id: "x",
    name: "Jana Nováková",
    channel: "form",
    message: "...",
    minutesAgo: 5,
  });
  assert.equal(vars.jméno, "Jana");
  assert.equal(vars.kanál, "Formulář");
});

test("expandSnippet replaces every {jméno} / {kanál} and leaves unknowns intact", () => {
  const out = expandSnippet("Dobrý den, {jméno}, ozveme se přes {kanál}. {jméno}!", {
    jméno: "Petr",
    kanál: "Hovor",
  });
  assert.equal(out, "Dobrý den, Petr, ozveme se přes Hovor. Petr!");
  // Unknown placeholder is left verbatim, not dropped.
  assert.equal(expandSnippet("ahoj {neznámé}", { jméno: "A", kanál: "B" }), "ahoj {neznámé}");
  // No placeholders → unchanged.
  assert.equal(expandSnippet("bez proměnných", { jméno: "A", kanál: "B" }), "bez proměnných");
});

test("coerceSnippets keeps valid entries, drops malformed, falls back to defaults", () => {
  const valid = [{ id: "a", name: "A", body: "b" }];
  assert.deepEqual(coerceSnippets(valid), valid);
  // Malformed entries are dropped; an all-bad array falls back to defaults.
  assert.deepEqual(coerceSnippets([{ id: 1, name: "x" }, null, "nope"]), DEFAULT_SNIPPETS);
  assert.deepEqual(coerceSnippets("not-an-array"), DEFAULT_SNIPPETS);
  assert.deepEqual(coerceSnippets([]), DEFAULT_SNIPPETS);
  // Mixed: keep the good, drop the bad.
  assert.deepEqual(coerceSnippets([{ id: "a", name: "A", body: "b" }, { bad: true }]), valid);
});
