/** Direction 1 — recaps become records: the pure state transitions and the staleness
 *  decision (src/lib/recaps/types.ts). The per-period history cap, newest-first
 *  append, latest / history lookups, the input hash's stability, and isRecapStale.
 *  Pure — no store I/O.
 *
 *  types.ts is JSON-free (it only imports node:crypto + erased types), so it imports
 *  directly under the resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendRecap,
  buildStoredRecap,
  capPerPeriod,
  historyForPeriod,
  isRecapStale,
  latestForPeriod,
  recapInputHash,
  recapInputHashLegacy,
  recapCurrentHashes,
  RECAP_HISTORY_CAP,
} from "@/lib/recaps/types";

let seq = 0;
const idOf = () => `id-${++seq}`;

function recap(period = "30d", over = {}) {
  return buildStoredRecap(
    {
      period,
      result: { headline: "h", summary: "s", highlights: ["a"], watchouts: ["b"], priorities: [{ title: "t", detail: "d" }] },
      inputHash: "hash-" + period,
      locale: "cs",
      ...over,
    },
    idOf
  );
}

test("buildStoredRecap stamps id + createdAt and carries the payload", () => {
  const r = recap("90d", { inputHash: "abc", locale: "en" });
  assert.equal(r.period, "90d");
  assert.equal(r.inputHash, "abc");
  assert.equal(r.locale, "en");
  assert.ok(r.id);
  assert.ok(!Number.isNaN(Date.parse(r.createdAt)));
  assert.equal(r.result.headline, "h");
});

test("capPerPeriod keeps at most N of each period, newest-first order preserved", () => {
  const items = [];
  for (let i = 0; i < RECAP_HISTORY_CAP + 4; i++) items.push(recap("30d"));
  items.push(recap("90d"));
  items.push(recap("12m"));
  const capped = capPerPeriod(items);
  assert.equal(capped.filter((x) => x.period === "30d").length, RECAP_HISTORY_CAP);
  assert.equal(capped.filter((x) => x.period === "90d").length, 1);
  assert.equal(capped.filter((x) => x.period === "12m").length, 1);
});

test("appendRecap prepends and re-caps per period; other periods coexist", () => {
  let state = null;
  for (let i = 0; i < RECAP_HISTORY_CAP + 3; i++) {
    state = appendRecap(state, recap("30d"));
  }
  const thirty = state.items.filter((x) => x.period === "30d");
  assert.equal(thirty.length, RECAP_HISTORY_CAP);
  // newest-first: the last appended is at the front
  assert.equal(state.items[0].id, thirty[0].id);
  // a 90d append coexists with the capped 30d history
  state = appendRecap(state, recap("90d"));
  assert.equal(state.items[0].period, "90d");
  assert.equal(latestForPeriod(state, "90d").id, state.items[0].id);
  assert.equal(state.items.filter((x) => x.period === "30d").length, RECAP_HISTORY_CAP);
});

test("historyForPeriod returns only that period, newest-first, capped", () => {
  let state = null;
  for (let i = 0; i < RECAP_HISTORY_CAP + 2; i++) state = appendRecap(state, recap("30d"));
  state = appendRecap(state, recap("12m"));
  const h30 = historyForPeriod(state, "30d");
  assert.equal(h30.length, RECAP_HISTORY_CAP);
  assert.ok(h30.every((x) => x.period === "30d"));
  assert.equal(historyForPeriod(state, "12m").length, 1);
  assert.equal(historyForPeriod(null, "30d").length, 0);
});

test("latestForPeriod returns the newest for a period, or null", () => {
  assert.equal(latestForPeriod(null, "30d"), null);
  let state = appendRecap(null, recap("30d", { inputHash: "old" }));
  const newest = recap("30d", { inputHash: "new" });
  state = appendRecap(state, newest);
  assert.equal(latestForPeriod(state, "30d").id, newest.id);
  assert.equal(latestForPeriod(state, "90d"), null);
});

test("isRecapStale is true iff the stored input hash differs from the current one", () => {
  const r = recap("30d", { inputHash: "H1" });
  assert.equal(isRecapStale(r, "H1"), false); // same inputs → fresh
  assert.equal(isRecapStale(r, "H2"), true); // data changed → stale
});

test("isRecapStale accepts a dual-acceptance set: fresh iff the stored hash matches any", () => {
  const r = recap("30d", { inputHash: "LEGACY" });
  assert.equal(isRecapStale(r, ["NEW", "LEGACY"]), false); // matches the legacy member → fresh
  assert.equal(isRecapStale(r, ["NEW", "OTHER"]), true); // matches neither → stale
  assert.equal(isRecapStale(recap("30d", { inputHash: "NEW" }), ["NEW", "LEGACY"]), false);
});

test("recapInputHash is stable for equal inputs and flips on any determinant", () => {
  const data = { daily: [{ date: "2025-01-01", revenue: 100 }] };
  const base = recapInputHash("cs", "30d", "eshop", data);
  assert.equal(base, recapInputHash("cs", "30d", "eshop", data), "stable for equal inputs");
  // Each determinant changes the hash — so each honestly flips a stored recap stale.
  assert.notEqual(base, recapInputHash("en", "30d", "eshop", data), "locale");
  assert.notEqual(base, recapInputHash("cs", "90d", "eshop", data), "period");
  assert.notEqual(base, recapInputHash("cs", "30d", "leadgen", data), "project type");
  assert.notEqual(base, recapInputHash("cs", "30d", "eshop", { daily: [{ date: "2025-01-01", revenue: 200 }] }), "dataset numbers");
});

test("recapInputHash digests the series cheaply: same count/dates/totals digest equal", () => {
  // Two series with identical row count, window bounds, and additive totals summarize
  // the same → they digest equal (the recap over them is the same), even if the rows
  // differ in a way that preserves every total. Regenerating with re-fetched-but-equal
  // numbers therefore does NOT flip a recap stale.
  const a = { daily: [{ date: "2025-01-01", visits: 10, cost: 5, conversions: 1, revenue: 100 }, { date: "2025-01-02", visits: 20, cost: 5, conversions: 1, revenue: 100 }] };
  const b = { daily: [{ date: "2025-01-01", visits: 15, cost: 5, conversions: 1, revenue: 100 }, { date: "2025-01-02", visits: 15, cost: 5, conversions: 1, revenue: 100 }] };
  assert.equal(recapInputHash("cs", "30d", "eshop", a), recapInputHash("cs", "30d", "eshop", b), "equal totals+count+bounds → equal");
  // A changed total, row count, or window bound flips it.
  const more = { daily: [...a.daily, { date: "2025-01-03", visits: 1, cost: 1, conversions: 0, revenue: 1 }] };
  assert.notEqual(recapInputHash("cs", "30d", "eshop", a), recapInputHash("cs", "30d", "eshop", more), "extra row → stale");
  assert.notEqual(recapInputHash("cs", "30d", "eshop", a), recapInputHash("cs", "30d", "eshop", undefined), "empty vs populated");
});

test("dual-acceptance: a recap stored with the LEGACY hash still reads fresh", () => {
  const data = { daily: [{ date: "2025-01-01", visits: 10, cost: 5, conversions: 1, revenue: 100 }] };
  // A recap persisted before the digest optimization carries the legacy whole-dataset
  // hash. On the same current inputs, recapCurrentHashes offers both formats, so it is
  // NOT flagged stale on deploy.
  const legacy = recapInputHashLegacy("cs", "30d", "eshop", data);
  const stored = recap("30d", { inputHash: legacy });
  const hashes = recapCurrentHashes("cs", "30d", "eshop", data);
  assert.notEqual(hashes[0], legacy, "new format differs from legacy");
  assert.equal(hashes[1], legacy, "legacy member reproduces the old hash");
  assert.equal(isRecapStale(stored, hashes), false, "legacy-stored recap reads fresh");
});

test("dual-acceptance: changed data flips both new- and legacy-stored recaps stale", () => {
  const before = { daily: [{ date: "2025-01-01", visits: 10, cost: 5, conversions: 1, revenue: 100 }] };
  const after = { daily: [{ date: "2025-01-01", visits: 10, cost: 5, conversions: 1, revenue: 250 }] };
  const newStored = recap("30d", { inputHash: recapInputHash("cs", "30d", "eshop", before) });
  const legacyStored = recap("30d", { inputHash: recapInputHashLegacy("cs", "30d", "eshop", before) });
  const nowHashes = recapCurrentHashes("cs", "30d", "eshop", after);
  assert.equal(isRecapStale(newStored, nowHashes), true, "new-format recap goes stale on data change");
  assert.equal(isRecapStale(legacyStored, nowHashes), true, "legacy-format recap goes stale on data change");
});
