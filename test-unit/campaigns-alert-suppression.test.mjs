/** Alert hygiene (src/lib/campaigns/alert-suppression.ts): hysteresis + per-key
 *  cooldown must turn a flickering campaign into ONE alert per cooldown window,
 *  and group a recovered-then-relapsed key instead of duplicating it. Pure policy,
 *  driven here by synthetic sync sequences with an injected clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planSuppression,
  groupAlertRecords,
  ALERT_COOLDOWN_MS,
} from "@/lib/campaigns/alert-suppression";

const COOLDOWN = 1000; // 1s window for deterministic sequences

/** Replay a sequence of sync steps, threading the state forward. Returns the
 *  step indexes at which each key actually fired an alert. */
function replay(steps) {
  let state = {};
  const firedAt = [];
  steps.forEach((step, i) => {
    const res = planSuppression(state, {
      breaching: step.breaching ?? [],
      banded: step.banded ?? [],
      now: step.now,
      cooldownMs: COOLDOWN,
    });
    state = res.nextState;
    for (const key of res.toAlert) firedAt.push({ i, key, count: res.counts[key] });
  });
  return { firedAt, state };
}

test("flicker across the critical boundary → one alert per cooldown window", () => {
  // critical, recovered, critical, recovered, critical — all inside one window.
  const { firedAt } = replay([
    { breaching: ["c1"], now: 0 },
    { breaching: [], now: 100 },
    { breaching: ["c1"], now: 200 },
    { breaching: [], now: 300 },
    { breaching: ["c1"], now: 400 },
  ]);
  assert.equal(firedAt.length, 1, "exactly one alert across the flicker");
  assert.equal(firedAt[0].i, 0);
});

test("hysteresis band: recovery only to 'warning' does not re-arm", () => {
  const { firedAt } = replay([
    { breaching: ["c1"], now: 0 }, // critical → alert
    { banded: ["c1"], now: 100 }, // recovered only to warning (band) → held
    { breaching: ["c1"], now: 200 }, // back to critical, within cooldown → suppressed
  ]);
  assert.equal(firedAt.length, 1, "band flicker stays a single alert");
});

test("recovered-then-relapsed WITHIN cooldown groups (count++) instead of duplicating", () => {
  const { firedAt, state } = replay([
    { breaching: ["c1"], now: 0 }, // alert, count 1
    { breaching: [], now: 100 }, // full recovery (tombstone kept for cooldown)
    { breaching: ["c1"], now: 200 }, // relapse within cooldown → grouped, no alert
  ]);
  assert.equal(firedAt.length, 1, "no duplicate row for the in-window relapse");
  assert.equal(state.c1.count, 2, "the repeat is counted for the inbox ×N badge");
});

test("recovered-then-relapsed AFTER cooldown re-alerts (a real new episode)", () => {
  const { firedAt } = replay([
    { breaching: ["c1"], now: 0 },
    { breaching: [], now: 100 },
    { breaching: ["c1"], now: 100 + COOLDOWN }, // relapse past the window
  ]);
  assert.equal(firedAt.length, 2);
  assert.equal(firedAt[1].count, 2, "reminder carries the running episode count");
});

test("still-broken key re-alerts only once the cooldown elapses (reminder)", () => {
  const { firedAt } = replay([
    { breaching: ["c1"], now: 0 },
    { breaching: ["c1"], now: 500 }, // still critical, within window → suppressed
    { breaching: ["c1"], now: 1000 }, // cooldown elapsed → reminder
  ]);
  assert.equal(firedAt.length, 2);
  assert.deepEqual(firedAt.map((f) => f.i), [0, 2]);
});

test("anomaly memory is NOT wiped by a zero-breach sync (the old re-alert bug)", () => {
  // A sync that finds no anomalies must not clear the memory and let the very
  // same day re-alert on the next sync.
  const { firedAt } = replay([
    { breaching: ["2026-07-01|cost|spike"], now: 0 },
    { breaching: [], now: 100 }, // zero anomalies this sync
    { breaching: ["2026-07-01|cost|spike"], now: 200 }, // same day resurfaces
  ]);
  assert.equal(firedAt.length, 1, "the recurring day does not re-alert within cooldown");
});

test("distinct keys each get their own episode", () => {
  const { firedAt } = replay([
    { breaching: ["a", "b"], now: 0 },
    { breaching: ["a", "b", "c"], now: 100 }, // c is new → alerts; a,b suppressed
  ]);
  assert.deepEqual(
    firedAt.map((f) => f.key),
    ["a", "b", "c"]
  );
  assert.equal(firedAt.filter((f) => f.i === 1).length, 1);
});

test("the exported cooldown window is a positive constant", () => {
  assert.ok(ALERT_COOLDOWN_MS > 0);
});

// --- inbox grouping ---------------------------------------------------------

const rec = (id, ids, read, createdAt) => ({
  id,
  type: "critical",
  title: "1 nová kritická kampaň",
  body: "b",
  items: ids.map((c) => ({ campaignId: c })),
  createdAt,
  read,
});

test("groupAlertRecords collapses repeats of the same campaign set with a count", () => {
  // newest-first (as listAlerts returns)
  const groups = groupAlertRecords([
    rec("a3", ["c1"], false, "2026-07-03"),
    rec("a2", ["c1"], true, "2026-07-02"),
    rec("a1", ["c1"], true, "2026-07-01"),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].unread, 1);
  assert.equal(groups[0].latest.id, "a3", "newest record represents the group");
});

test("groupAlertRecords keeps different campaign sets as separate rows", () => {
  const groups = groupAlertRecords([
    rec("b1", ["c2"], false, "2026-07-03"),
    rec("a2", ["c1"], false, "2026-07-02"),
    rec("a1", ["c1"], false, "2026-07-01"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.count).sort(), [1, 2]);
});
