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
import { draftReply } from "@/lib/speed-lead/draft";

const lead = (channel) => ({ id: "x", name: "Jana Nováková", channel, message: "...", minutesAgo: 2 });

test("empty qualification scores 0, is cold, and counts no answered fields", () => {
  assert.equal(qualificationScore(EMPTY_QUALIFICATION), 0);
  assert.equal(answeredCount(EMPTY_QUALIFICATION), 0);
  assert.equal(scoreTone(0), "negative");
  assert.equal(scoreLabel(0, "cs"), "Studený lead");
  assert.equal(scoreLabel(0, "en"), "Cold lead");
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
  assert.equal(scoreLabel(60, "cs"), "Horký lead");
  assert.equal(scoreLabel(40, "cs"), "Vlažný lead");
  assert.equal(scoreLabel(39, "cs"), "Studený lead");
  // The band is locale-resolved (mirrors severityLabel), so the same thresholds
  // must produce the English labels too.
  assert.equal(scoreLabel(60, "en"), "Hot lead");
  assert.equal(scoreLabel(40, "en"), "Warm lead");
  assert.equal(scoreLabel(39, "en"), "Cold lead");
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

test("draftReply promises the follow-up on the lead's OWN channel, never a blind phone call", () => {
  assert.match(draftReply(lead("email")).reply, /odpovíme Vám na e-mail/);
  assert.match(draftReply(lead("chat")).reply, /odpovíme Vám zde/);
  assert.match(draftReply(lead("form")).reply, /na uvedený kontakt/);
  assert.match(draftReply(lead("call")).reply, /telefonicky/);
  // An email lead must NOT be promised a phone call.
  assert.doesNotMatch(draftReply(lead("email")).reply, /telefonicky/);
  // Greets by first name.
  assert.match(draftReply(lead("email")).reply, /Dobrý den, Jana,/);
});

test("draftReply drops the gendered ráda/rád and signs off with the brand when given", () => {
  const neutral = draftReply(lead("form")).reply;
  assert.doesNotMatch(neutral, /ráda\/rád/);
  assert.match(neutral, /rádi ji posuneme/); // neutral team voice
  assert.match(neutral, /S pozdravem,\nnáš tým/); // no placeholder when no brand
  const branded = draftReply(lead("form"), "Adamant").reply;
  assert.match(branded, /S pozdravem,\nAdamant/);
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
