/** Unit tests for subscriber-source attribution: new-sub shares sum to ~100 %,
 *  the blended cost-per-sub is paid-only spend ÷ paid subs, and the single
 *  lowest-retention source is flagged. Runs the TS source directly via the
 *  shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceAttribution } from "@/lib/audience/compute";
import { SAMPLE_SUBSCRIBER_SOURCES } from "@/lib/audience/sample";

test("shares sum to ~100 % and rows are sorted by share, descending", () => {
  const { rows } = sourceAttribution([
    { source: "Organic", newSubs: 600, retention30: 0.7 },
    { source: "Paid", newSubs: 300, costPerSub: 50, retention30: 0.4 },
    { source: "Referral", newSubs: 100, retention30: 0.8 },
  ]);

  const total = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares sum to ${total}, expected ~1`);

  // sorted by share desc → Organic (0.6), Paid (0.3), Referral (0.1)
  assert.deepEqual(
    rows.map((r) => r.source),
    ["Organic", "Paid", "Referral"]
  );
  assert.ok(Math.abs(rows[0].share - 0.6) < 1e-9);
});

test("blendedCostPerSub uses paid spend ÷ paid subs (ignores organic)", () => {
  const { blendedCostPerSub, totalNewSubs } = sourceAttribution([
    { source: "Organic", newSubs: 600, retention30: 0.7 }, // no cost → excluded
    { source: "PaidA", newSubs: 300, costPerSub: 40, retention30: 0.5 },
    { source: "PaidB", newSubs: 100, costPerSub: 80, retention30: 0.6 },
  ]);
  // total spend = 300*40 + 100*80 = 20 000; paid subs = 400 → 50
  assert.equal(blendedCostPerSub, 50);
  // total counts all channels, including organic
  assert.equal(totalNewSubs, 1000);
});

test("blendedCostPerSub is 0 when there are no paid channels", () => {
  const { blendedCostPerSub } = sourceAttribution([
    { source: "Organic", newSubs: 600, retention30: 0.7 },
    { source: "Referral", newSubs: 400, retention30: 0.8 },
  ]);
  assert.equal(blendedCostPerSub, 0);
});

test("the single lowest-retention source is flagged (first wins on ties)", () => {
  const { rows, lowestRetentionSource } = sourceAttribution([
    { source: "High", newSubs: 100, retention30: 0.8 },
    { source: "Low", newSubs: 200, costPerSub: 30, retention30: 0.3 },
    { source: "Mid", newSubs: 150, retention30: 0.5 },
  ]);
  assert.equal(lowestRetentionSource, "Low");
  const flagged = rows.filter((r) => r.lowestRetention);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].source, "Low");
});

test("empty input is safe (no NaN shares, null flag, zero cost)", () => {
  const { rows, totalNewSubs, blendedCostPerSub, lowestRetentionSource } = sourceAttribution([]);
  assert.deepEqual(rows, []);
  assert.equal(totalNewSubs, 0);
  assert.equal(blendedCostPerSub, 0);
  assert.equal(lowestRetentionSource, null);
});

test("the bundled sample rolls up consistently", () => {
  const { rows, totalNewSubs } = sourceAttribution(SAMPLE_SUBSCRIBER_SOURCES);
  // shares still sum to ~1 on the real fixture
  const sumShare = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sumShare - 1) < 1e-9, `sample shares sum to ${sumShare}`);
  // totalNewSubs equals the raw sum of the fixture
  const rawSum = SAMPLE_SUBSCRIBER_SOURCES.reduce((a, x) => a + x.newSubs, 0);
  assert.equal(totalNewSubs, rawSum);
  // exactly one source flagged as lowest retention
  assert.equal(rows.filter((r) => r.lowestRetention).length, 1);
});
