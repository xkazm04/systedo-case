/** Canonical prompt-safe name resolver (src/lib/projects/name.ts): the one place
 *  that strips demo/ukázka markers before a name reaches a public-looking prompt. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { promptSafeName } from "@/lib/projects/name";

test("strips a trailing (demo) / (ukázka) / (sample) marker", () => {
  assert.equal(promptSafeName("Dentalis (demo)"), "Dentalis");
  assert.equal(promptSafeName("Klinika (ukázka)"), "Klinika");
  assert.equal(promptSafeName("Shop (Sample)"), "Shop"); // case-insensitive
  assert.equal(promptSafeName("X (demo) "), "X"); // trailing whitespace
});

test("leaves a clean brand untouched", () => {
  assert.equal(promptSafeName("Mionelo"), "Mionelo");
  assert.equal(promptSafeName("Rohlík.cz"), "Rohlík.cz");
});

test("only strips a trailing marker — mid-string parentheses are real text", () => {
  assert.equal(promptSafeName("Weird (demo) mid"), "Weird (demo) mid");
});

test("empty / nullish input is the empty string (safe to spread out)", () => {
  assert.equal(promptSafeName(""), "");
  assert.equal(promptSafeName(undefined), "");
  assert.equal(promptSafeName(null), "");
});
