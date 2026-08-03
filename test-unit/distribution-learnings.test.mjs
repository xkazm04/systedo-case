/** Unit tests for the per-variant performance learnings rollup: CTR per variant,
 *  sorted descending; the best channel / format / length picked by reach-weighted
 *  CTR. (The sparkline itself is the shared @/components/charts/Sparkline
 *  primitive — there is no local geometry left here to test.) Runs the TS source
 *  directly via the shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rollupLearnings,
  lengthBucket,
  channelFormat,
} from "@/lib/distribution/learnings";
import { SAMPLE_ATTRIBUTION } from "@/lib/distribution/sample";

const ZERO_LEN = () => 0;

test("lengthBucket classifies by character count", () => {
  assert.equal(lengthBucket(0), "Krátké");
  assert.equal(lengthBucket(300), "Krátké");
  assert.equal(lengthBucket(301), "Střední");
  assert.equal(lengthBucket(900), "Střední");
  assert.equal(lengthBucket(901), "Dlouhé");
});

test("channelFormat maps known channels and falls back for unknown ones", () => {
  assert.equal(channelFormat("Newsletter"), "Newsletter");
  assert.equal(channelFormat("Instagram"), "Vizuální");
  assert.equal(channelFormat("X / Twitter"), "Krátký příspěvek");
  assert.equal(channelFormat("Neznámý"), "Krátký příspěvek");
});

test("rollupLearnings computes per-variant CTR and sorts descending", () => {
  const { rows, bestVariant } = rollupLearnings(
    [
      { channel: "A", reach: 1000, clicks: 100 }, // 0.10
      { channel: "B", reach: 1000, clicks: 250 }, // 0.25
      { channel: "C", reach: 1000, clicks: 50 }, //  0.05
    ],
    ZERO_LEN
  );
  assert.deepEqual(
    rows.map((r) => r.channel),
    ["B", "A", "C"]
  );
  assert.equal(bestVariant.channel, "B");
  assert.ok(Math.abs(bestVariant.ctr - 0.25) < 1e-9);
});

test("rollupLearnings never produces NaN CTR on zero reach", () => {
  const { rows, overallCtr } = rollupLearnings([{ channel: "Z", reach: 0, clicks: 0 }], ZERO_LEN);
  assert.equal(rows[0].ctr, 0);
  assert.equal(overallCtr, 0);
});

test("best channel / format / length use reach-weighted CTR", () => {
  // Two LinkedIn-format channels: a small high-CTR one and a large low-CTR one.
  // Reach-weighting should pull the blended LinkedIn-format CTR below Newsletter.
  const { bestChannel, bestFormat } = rollupLearnings(
    [
      { channel: "Newsletter", reach: 1000, clicks: 200 }, // 0.20, format Newsletter
      { channel: "LinkedIn", reach: 100, clicks: 30 }, //     0.30, format Dlouhý
      { channel: "Facebook", reach: 5000, clicks: 250 }, //   0.05, format Dlouhý
    ],
    ZERO_LEN
  );
  // best single channel by its own CTR weighting (one variant each) = LinkedIn 0.30
  assert.equal(bestChannel.value, "LinkedIn");
  // but the Dlouhý format blends LinkedIn+Facebook = 280/5100 ≈ 0.055 < Newsletter 0.20
  assert.equal(bestFormat.value, "Newsletter");
});

test("best length groups by the provided per-channel lengths", () => {
  const lengthOf = (ch) => (ch === "Short" ? 100 : 1200);
  const { bestLength, rows } = rollupLearnings(
    [
      { channel: "Short", reach: 1000, clicks: 200 }, // Krátké, 0.20
      { channel: "Long", reach: 1000, clicks: 50 }, //   Dlouhé, 0.05
    ],
    lengthOf
  );
  assert.equal(bestLength.value, "Krátké");
  assert.equal(rows.find((r) => r.channel === "Short").length, "Krátké");
  assert.equal(rows.find((r) => r.channel === "Long").length, "Dlouhé");
});

test("empty attribution rolls up to nulls, not throws", () => {
  const l = rollupLearnings([], ZERO_LEN);
  assert.deepEqual(l.rows, []);
  assert.equal(l.bestVariant, null);
  assert.equal(l.bestChannel, null);
  assert.equal(l.bestFormat, null);
  assert.equal(l.bestLength, null);
  assert.equal(l.overallCtr, 0);
});

test("the bundled sample ranks Newsletter as the best variant + channel", () => {
  const l = rollupLearnings(SAMPLE_ATTRIBUTION, ZERO_LEN);
  // Newsletter 1260/8400 = 0.15 is the highest CTR in the fixture
  assert.equal(l.bestVariant.channel, "Newsletter");
  assert.equal(l.bestChannel.value, "Newsletter");
  // overall reach-weighted CTR = total clicks / total reach
  const totReach = SAMPLE_ATTRIBUTION.reduce((a, c) => a + c.reach, 0);
  const totClicks = SAMPLE_ATTRIBUTION.reduce((a, c) => a + c.clicks, 0);
  assert.ok(Math.abs(l.overallCtr - totClicks / totReach) < 1e-9);
});
