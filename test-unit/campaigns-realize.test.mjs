/** WP W2-E — realized impact of an applied change-set (src/lib/campaigns/realize.ts).
 *  Pure fixture math, no store: the two 7-day windows, the touched-campaign
 *  selection, the honest `insufficient` degradation and the ratio guards. The I/O
 *  half (the runner + the sync hook) is proven in
 *  campaigns-realize-run-local-store.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  realizeChangeSet,
  touchedCampaignIds,
  REALIZE_WINDOW_DAYS,
  REALIZE_MIN_DAYS,
} from "@/lib/campaigns/realize";

const DAY = 24 * 60 * 60 * 1000;

/** Applied on 2026-08-10 → after window 08-10…08-16, before window 08-03…08-09. */
const APPROVED_AT = "2026-08-10T09:00:00.000Z";
const APPLY_MS = Date.parse(APPROVED_AT);
/** Comfortably past `approvedAt + 7d` — the set is due. */
const DUE_NOW = Date.parse("2026-08-18T00:00:00.000Z");

/** `count` consecutive daily points from `startIso`, all with the same numbers. */
function days(startIso, count, { cost, value }) {
  const start = Date.parse(`${startIso}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * DAY).toISOString().slice(0, 10),
    cost,
    conversions: 1,
    conversionValue: value,
  }));
}

/** d1 donates to w1; the projection claims +1050 of conversion value. */
function appliedSet(over = {}) {
  return {
    status: "applied",
    approvedAt: APPROVED_AT,
    moves: [
      { fromId: "d1", fromName: "D", toId: "w1", toName: "W", amount: 400, fromRoas: 1, toRoas: 4, estValueGain: 1200 },
    ],
    simulation: { before: { conversionValue: 1000 }, after: { conversionValue: 2050 } },
    ...over,
  };
}

/** Both windows fully covered: d1 gains +700 of value, w1 +1400 → +2100 total. */
const FULL_SERIES = {
  d1: [...days("2026-08-03", 7, { cost: 100, value: 200 }), ...days("2026-08-10", 7, { cost: 100, value: 300 })],
  w1: [...days("2026-08-03", 7, { cost: 100, value: 500 }), ...days("2026-08-10", 7, { cost: 100, value: 700 })],
};

// --- the measured case --------------------------------------------------------

test("a due applied set over a fully-covered series measures both windows", () => {
  const r = realizeChangeSet(appliedSet(), FULL_SERIES, DUE_NOW);
  assert.ok(r, "a due set produces a measurement");
  assert.equal(r.status, "measured");
  assert.equal(r.windowDays, REALIZE_WINDOW_DAYS);
  assert.deepEqual(r.daysCovered, { before: 7, after: 7 });
  assert.equal(r.computedAt, new Date(DUE_NOW).toISOString());
});

test("the per-campaign sums are the 7-day totals of each window, touched ids only", () => {
  const r = realizeChangeSet(appliedSet(), FULL_SERIES, DUE_NOW);
  assert.deepEqual(
    r.campaigns.map((c) => c.id),
    ["d1", "w1"],
    "donor then recipient, in move order"
  );
  const [d1, w1] = r.campaigns;
  assert.equal(d1.valueBefore, 1400); // 7 × 200
  assert.equal(d1.valueAfter, 2100); // 7 × 300
  assert.equal(d1.costBefore, 700);
  assert.equal(d1.costAfter, 700);
  assert.equal(w1.valueBefore, 3500); // 7 × 500
  assert.equal(w1.valueAfter, 4900); // 7 × 700
});

test("the realized delta is the touched set's value change, and the ratio scores it", () => {
  const r = realizeChangeSet(appliedSet(), FULL_SERIES, DUE_NOW);
  assert.equal(r.realizedValueDelta, 2100, "(2100−1400) + (4900−3500)");
  assert.equal(r.projectedValueGain, 1050, "snapshot of projectedValueGain(sim)");
  assert.equal(r.ratio, 2, "the account delivered twice what was projected");
});

test("a campaign outside the touched set never enters the sums", () => {
  const r = realizeChangeSet(appliedSet(), { ...FULL_SERIES, other: days("2026-08-03", 14, { cost: 9e6, value: 9e6 }) }, DUE_NOW);
  assert.equal(r.campaigns.length, 2);
  assert.equal(r.realizedValueDelta, 2100, "an untouched campaign's series is ignored");
});

test("days outside either window are excluded from the sums", () => {
  const noisy = {
    ...FULL_SERIES,
    // the day BEFORE the before-window and the day AFTER the after-window
    d1: [
      ...days("2026-08-02", 1, { cost: 1e6, value: 1e6 }),
      ...FULL_SERIES.d1,
      ...days("2026-08-17", 1, { cost: 1e6, value: 1e6 }),
    ],
  };
  const r = realizeChangeSet(appliedSet(), noisy, DUE_NOW);
  assert.equal(r.realizedValueDelta, 2100, "the 14-day comparison window is closed on both ends");
});

// --- "not due yet" is null, never a persisted degradation ---------------------

test("a set whose after-window has not elapsed returns null (try again next sync)", () => {
  assert.equal(realizeChangeSet(appliedSet(), FULL_SERIES, APPLY_MS + 6 * DAY), null);
  assert.equal(realizeChangeSet(appliedSet(), FULL_SERIES, APPLY_MS + 7 * DAY - 1), null);
  assert.ok(realizeChangeSet(appliedSet(), FULL_SERIES, APPLY_MS + 7 * DAY), "due exactly at +7d");
});

test("only an APPLIED set is realized — approvedAt is stamped on failed settles too", () => {
  for (const status of ["pending", "applying", "reverted", "reverting", "failed"]) {
    assert.equal(realizeChangeSet(appliedSet({ status }), FULL_SERIES, DUE_NOW), null, status);
  }
});

test("a missing or unparseable approvedAt returns null rather than guessing a window", () => {
  assert.equal(realizeChangeSet(appliedSet({ approvedAt: null }), FULL_SERIES, DUE_NOW), null);
  assert.equal(realizeChangeSet(appliedSet({ approvedAt: "never" }), FULL_SERIES, DUE_NOW), null);
});

// --- honest degradation -------------------------------------------------------

test("a before-window the stored series no longer covers degrades to 'insufficient'", () => {
  // only 4 of the 7 before-days survive in the stored (rolling) series
  const thin = {
    d1: [...days("2026-08-06", 4, { cost: 100, value: 200 }), ...days("2026-08-10", 7, { cost: 100, value: 300 })],
    w1: [...days("2026-08-06", 4, { cost: 100, value: 500 }), ...days("2026-08-10", 7, { cost: 100, value: 700 })],
  };
  const r = realizeChangeSet(appliedSet(), thin, DUE_NOW);
  assert.equal(r.status, "insufficient");
  assert.equal(r.daysCovered.before, 4);
  assert.equal(r.daysCovered.after, 7);
  assert.equal(r.ratio, null, "an uncovered window never yields a ratio");
});

test("exactly REALIZE_MIN_DAYS of coverage on both sides still measures", () => {
  const edge = {
    d1: [...days("2026-08-05", 5, { cost: 100, value: 200 }), ...days("2026-08-10", 5, { cost: 100, value: 300 })],
    w1: [],
  };
  const r = realizeChangeSet(appliedSet(), edge, DUE_NOW);
  assert.equal(REALIZE_MIN_DAYS, 5);
  assert.equal(r.status, "measured");
  assert.deepEqual(r.daysCovered, { before: 5, after: 5 });
});

test("a series with no touched campaign at all is insufficient, not a zero measurement", () => {
  const r = realizeChangeSet(appliedSet(), {}, DUE_NOW);
  assert.equal(r.status, "insufficient");
  assert.deepEqual(r.daysCovered, { before: 0, after: 0 });
  assert.equal(r.realizedValueDelta, 0);
  assert.equal(r.ratio, null);
});

// --- ratio guards -------------------------------------------------------------

test("a projection of zero or less yields a null ratio, not an Infinity", () => {
  const flat = appliedSet({ simulation: { before: { conversionValue: 1000 }, after: { conversionValue: 1000 } } });
  const zero = realizeChangeSet(flat, FULL_SERIES, DUE_NOW);
  assert.equal(zero.status, "measured", "the measurement itself is still valid");
  assert.equal(zero.projectedValueGain, 0);
  assert.equal(zero.ratio, null);

  const negative = appliedSet({ simulation: { before: { conversionValue: 1000 }, after: { conversionValue: 900 } } });
  assert.equal(realizeChangeSet(negative, FULL_SERIES, DUE_NOW).ratio, null);
});

test("a realized LOSS scores as a negative ratio rather than being hidden", () => {
  const worse = {
    d1: [...days("2026-08-03", 7, { cost: 100, value: 300 }), ...days("2026-08-10", 7, { cost: 100, value: 200 })],
    w1: [...days("2026-08-03", 7, { cost: 100, value: 700 }), ...days("2026-08-10", 7, { cost: 100, value: 500 })],
  };
  const r = realizeChangeSet(appliedSet(), worse, DUE_NOW);
  assert.equal(r.realizedValueDelta, -2100);
  assert.equal(r.ratio, -2);
});

// --- touched-campaign selection ----------------------------------------------

test("a PAUSE move contributes its donor only — it has no recipient", () => {
  assert.deepEqual(
    touchedCampaignIds([{ kind: "pause", fromId: "z1", fromName: "Z", toId: "", toName: "", amount: 1, fromRoas: 0, toRoas: 0, estValueGain: 0 }]),
    ["z1"],
    "an empty toId must never be measured as a campaign"
  );
});

test("touched ids are de-duplicated and order-stable across moves", () => {
  assert.deepEqual(
    touchedCampaignIds([
      { fromId: "d1", toId: "w1" },
      { fromId: "d2", toId: "w1" },
      { kind: "pause", fromId: "d1", toId: "" },
    ]),
    ["d1", "w1", "d2"]
  );
});

test("a mixed pause+shift set measures the pause donor alongside the shift pair", () => {
  const mixed = appliedSet({
    moves: [
      { kind: "pause", fromId: "z1", fromName: "Z", toId: "", toName: "", amount: 8000, fromRoas: 0, toRoas: 0, estValueGain: 0 },
      { fromId: "d1", fromName: "D", toId: "w1", toName: "W", amount: 400, fromRoas: 1, toRoas: 4, estValueGain: 1200 },
    ],
  });
  const series = { ...FULL_SERIES, z1: days("2026-08-03", 7, { cost: 500, value: 0 }) };
  const r = realizeChangeSet(mixed, series, DUE_NOW);
  assert.deepEqual(
    r.campaigns.map((c) => c.id),
    ["z1", "d1", "w1"]
  );
  const z1 = r.campaigns[0];
  assert.equal(z1.costBefore, 3500, "the paused burner was spending before");
  assert.equal(z1.costAfter, 0, "…and stopped, which is exactly what the pause claimed");
});
