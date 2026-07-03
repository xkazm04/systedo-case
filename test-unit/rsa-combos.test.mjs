/** Deterministic RSA-preview combination sampler (src/lib/rsa-combos.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleRsaCombo } from "@/lib/rsa-combos";

const H = ["H1", "H2", "H3", "H4", "H5"];
const D = ["D1", "D2", "D3"];

test("combination 0 is the classic first-3 + first-2 view", () => {
  const c = sampleRsaCombo(H, D, 0);
  assert.deepEqual(c.headlines, ["H1", "H2", "H3"]);
  assert.deepEqual(c.headlineNumbers, [1, 2, 3]);
  assert.deepEqual(c.descriptions, ["D1", "D2"]);
  assert.deepEqual(c.descriptionNumbers, [1, 2]);
  assert.equal(c.count, 5); // the longer list drives the rotation count
});

test("advancing rotates both lists with wrap-around", () => {
  const c = sampleRsaCombo(H, D, 3);
  assert.deepEqual(c.headlines, ["H4", "H5", "H1"]);
  assert.deepEqual(c.headlineNumbers, [4, 5, 1]);
  // 3 % 3 descriptions = start over at D1
  assert.deepEqual(c.descriptions, ["D1", "D2"]);
});

test("index wraps modulo count, including negatives and stale large values", () => {
  assert.deepEqual(sampleRsaCombo(H, D, 5), sampleRsaCombo(H, D, 0));
  assert.deepEqual(sampleRsaCombo(H, D, 12), sampleRsaCombo(H, D, 2));
  assert.deepEqual(sampleRsaCombo(H, D, -1), sampleRsaCombo(H, D, 4));
});

test("blank assets are ignored and short lists never repeat within one combo", () => {
  const c = sampleRsaCombo(["H1", "  ", "H2"], ["", "D1"], 1);
  // 2 non-blank headlines → only 2 shown, no duplicate to fill the third slot
  assert.deepEqual(c.headlines, ["H2", "H1"]);
  assert.deepEqual(c.headlineNumbers, [2, 1]);
  // a single description yields a single description
  assert.deepEqual(c.descriptions, ["D1"]);
  assert.equal(c.count, 2);
});

test("empty inputs degrade to an empty single combination", () => {
  const c = sampleRsaCombo([], [], 7);
  assert.equal(c.count, 1);
  assert.equal(c.index, 0);
  assert.deepEqual(c.headlines, []);
  assert.deepEqual(c.descriptions, []);
});
