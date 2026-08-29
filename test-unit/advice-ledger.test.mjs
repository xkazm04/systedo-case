/** WP W3-A — the advice ledger's pure math (src/lib/advice/ledger.ts). Storeless, no
 *  I/O, no framework: `updateAdviceLedger` is a function of (blob, recs, now), so every
 *  rule it owes can be proved by calling it. Copies the shape of
 *  campaigns-changeset-transitions.test.mjs.
 *
 *  What is pinned here is mostly what the ledger REFUSES to say: no outcome without a
 *  baseline, no outcome on sample data, no verdict inside the dead-band, no eviction of
 *  live advice while settled advice is still on the pile. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const {
  updateAdviceLedger,
  scoreAdviceRecord,
  sanitizeAdviceLedger,
  recentAdviceOutcomes,
  scoredAdviceOutcomes,
  dismissedSubjectKeys,
  adviceRecordFor,
  ADVICE_LEDGER_CAP,
  ADVICE_RESOLVE_AFTER_DAYS,
  ADVICE_OUTCOME_DEADBAND,
  ADVICE_INVERSE_KEYS,
} = await import("@/lib/advice/ledger");

const D = (iso) => new Date(iso);
const T0 = "2026-08-01T09:00:00.000Z";
const day = (n) => new Date(Date.parse(T0) + n * 86_400_000);

const sighting = (subjectKey, over = {}) => ({
  subjectKey,
  module: "lokalni",
  severity: "warning",
  title: `Advice ${subjectKey}`,
  ...over,
});

const snap = (key, value) => ({ snapshot: { key, value } });
const find = (ledger, key) => ledger.records.find((r) => r.subjectKey === key);

/** IEEE-754: (0.7 - 0.4) / 0.4 is 0.7499999999999998, not 0.75. The ratio is pinned to
 *  12 decimals — far tighter than anything the rendered ±X % can express, and it does
 *  not turn a float artefact into a failing gate. */
const closeTo = (actual, expected, msg) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-12,
    `${msg} — got ${actual}, expected ${expected}`
  );

// --- contract constants -----------------------------------------------------

test("the declared constants are the WP contract's, and pno is the live inverse key", () => {
  assert.equal(ADVICE_LEDGER_CAP, 200);
  assert.equal(ADVICE_RESOLVE_AFTER_DAYS, 3);
  assert.equal(ADVICE_OUTCOME_DEADBAND, 0.05);
  assert.deepEqual([...ADVICE_INVERSE_KEYS], ["pno", "daysToStockout"]);
});

// --- upsert: first sight, bump, first/last value -----------------------------

test("a first sighting creates an OPEN record with the snapshot as BOTH first and last value", () => {
  const l = updateAdviceLedger(null, [sighting("a", snap("coverage", 0.4))], day(0));
  const r = find(l, "a");
  assert.equal(r.status, "open");
  assert.equal(r.timesSeen, 1);
  assert.equal(r.reopenedCount, 0);
  assert.equal(r.firstSeenAt, r.lastSeenAt);
  assert.deepEqual(r.snapshot, { key: "coverage", firstValue: 0.4, lastValue: 0.4 });
  assert.equal(l.updatedAt, day(0).toISOString());
});

test("a repeat sighting bumps lastSeenAt + timesSeen and moves ONLY lastValue", () => {
  let l = updateAdviceLedger(null, [sighting("a", snap("coverage", 0.4))], day(0));
  l = updateAdviceLedger(l, [sighting("a", snap("coverage", 0.55))], day(1));
  l = updateAdviceLedger(l, [sighting("a", snap("coverage", 0.7))], day(2));
  const r = find(l, "a");
  assert.equal(r.timesSeen, 3);
  assert.equal(r.firstSeenAt, day(0).toISOString());
  assert.equal(r.lastSeenAt, day(2).toISOString());
  assert.deepEqual(r.snapshot, { key: "coverage", firstValue: 0.4, lastValue: 0.7 });
});

test("the title is frozen at first sight (locale of first sighting), severity follows", () => {
  let l = updateAdviceLedger(null, [sighting("a", { title: "Chybí stránka" })], day(0));
  l = updateAdviceLedger(l, [sighting("a", { title: "Missing page", severity: "critical" })], day(1));
  const r = find(l, "a");
  assert.equal(r.title, "Chybí stránka", "a re-render in another locale must not rewrite the record");
  assert.equal(r.severity, "critical", "severity is a current fact and follows the signal");
});

// --- resolve after N absent days --------------------------------------------

test("an absent subject stays OPEN until ADVICE_RESOLVE_AFTER_DAYS have passed", () => {
  let l = updateAdviceLedger(null, [sighting("a", snap("coverage", 0.4))], day(0));
  l = updateAdviceLedger(l, [], day(1));
  assert.equal(find(l, "a").status, "open", "one quiet day is a missed visit, not a result");
  l = updateAdviceLedger(l, [], day(2.9));
  assert.equal(find(l, "a").status, "open");
});

test("ACCEPTANCE: seen 3x, then absent 3 days -> resolved 'improved' with the exact deltaPct", () => {
  let l = updateAdviceLedger(null, [sighting("a", snap("coverage", 0.4))], day(0));
  l = updateAdviceLedger(l, [sighting("a", snap("coverage", 0.55))], day(1));
  l = updateAdviceLedger(l, [sighting("a", snap("coverage", 0.7))], day(2));
  assert.equal(find(l, "a").timesSeen, 3);
  l = updateAdviceLedger(l, [], day(5));
  const r = find(l, "a");
  assert.equal(r.status, "resolved");
  assert.equal(r.resolvedAt, day(5).toISOString());
  assert.equal(r.outcome.status, "improved");
  // (0.7 - 0.4) / |0.4| = 0.75.
  closeTo(r.outcome.deltaPct, 0.75, "coverage 0.4 → 0.7 is +75 %");
  assert.equal(r.outcome.at, day(5).toISOString());
});

test("a resolve with NO snapshot gets NO outcome — absence is not zero", () => {
  let l = updateAdviceLedger(null, [sighting("nosnap")], day(0));
  l = updateAdviceLedger(l, [], day(5));
  const r = find(l, "nosnap");
  assert.equal(r.status, "resolved");
  assert.equal(r.outcome, undefined, "a snapshot-less resolve must never be scored");
});

// --- scoring semantics: dead-band, inverse, zero baseline -------------------

test("a move inside the dead-band reads 'unchanged', just outside it flips", () => {
  const at = day(5).toISOString();
  const rec = (first, last) => ({ subjectKey: "x", snapshot: { key: "coverage", firstValue: first, lastValue: last } });
  assert.equal(scoreAdviceRecord(rec(1, 1.04), at).status, "unchanged");
  assert.equal(scoreAdviceRecord(rec(1, 1.05), at).status, "improved");
  assert.equal(scoreAdviceRecord(rec(1, 0.96), at).status, "unchanged");
  assert.equal(scoreAdviceRecord(rec(1, 0.95), at).status, "worse");
});

test("ACCEPTANCE: a `pno` fixture INVERTS the verdict and never the reported delta", () => {
  const at = day(5).toISOString();
  const fall = scoreAdviceRecord({ subjectKey: "p", snapshot: { key: "pno", firstValue: 0.5, lastValue: 0.4 } }, at);
  assert.equal(fall.status, "improved", "a PNO that fell is the improvement");
  closeTo(fall.deltaPct, -0.2, "the delta states what the METRIC did, never sign-flipped");
  const rise = scoreAdviceRecord({ subjectKey: "p", snapshot: { key: "pno", firstValue: 0.5, lastValue: 0.6 } }, at);
  assert.equal(rise.status, "worse");
  closeTo(rise.deltaPct, 0.2, "a PNO that rose reports a positive delta beside 'worse'");
  // The same numbers on a NON-inverse key read the opposite way — that is the point.
  const normal = scoreAdviceRecord({ subjectKey: "n", snapshot: { key: "poas", firstValue: 0.5, lastValue: 0.4 } }, at);
  assert.equal(normal.status, "worse");
});

test("a ZERO baseline falls back to a sign comparison rather than dividing by zero", () => {
  const at = day(5).toISOString();
  const s = (last) => scoreAdviceRecord({ subjectKey: "z", snapshot: { key: "poas", firstValue: 0, lastValue: last } }, at);
  assert.deepEqual({ ...s(3) }, { status: "improved", deltaPct: 1, at });
  assert.deepEqual({ ...s(-3) }, { status: "worse", deltaPct: -1, at });
  assert.deepEqual({ ...s(0) }, { status: "unchanged", deltaPct: 0, at });
});

test("a NEGATIVE baseline is compared against its magnitude (a decaying post recovering)", () => {
  const at = day(5).toISOString();
  const v = scoreAdviceRecord(
    { subjectKey: "d", snapshot: { key: "trafficChangePct", firstValue: -0.4, lastValue: -0.2 } },
    at
  );
  assert.equal(v.status, "improved");
  closeTo(v.deltaPct, 0.5, "−40 % → −20 % is a half-recovery of the magnitude");
});

// --- honesty: sample is never scored, and the flag is sticky -----------------

test("SAMPLE advice is tracked but NEVER scored", () => {
  let l = updateAdviceLedger(null, [sighting("s", { sample: true, ...snap("coverage", 0.4) })], day(0));
  l = updateAdviceLedger(l, [sighting("s", { sample: true, ...snap("coverage", 0.9) })], day(1));
  l = updateAdviceLedger(l, [], day(5));
  const r = find(l, "s");
  assert.equal(r.status, "resolved", "it still resolves — it just carries no verdict");
  assert.equal(r.sample, true);
  assert.equal(r.outcome, undefined, "a fixture-derived baseline can never justify 'improved'");
  assert.deepEqual(recentAdviceOutcomes(l, day(5)), [], "and it never reaches the chips");
  assert.deepEqual(scoredAdviceOutcomes(l), [], "nor the recap grounding");
});

test("the sample flag is STICKY — going live later cannot retro-legitimise the baseline", () => {
  let l = updateAdviceLedger(null, [sighting("s", { sample: true, ...snap("poas", 1) })], day(0));
  l = updateAdviceLedger(l, [sighting("s", snap("poas", 2))], day(1)); // now live
  assert.equal(find(l, "s").sample, true);
  l = updateAdviceLedger(l, [], day(5));
  assert.equal(find(l, "s").outcome, undefined);
});

// --- reopen -----------------------------------------------------------------

test("a signal that comes back REOPENS the same subject: counters run on, outcome dropped", () => {
  let l = updateAdviceLedger(null, [sighting("a", snap("poas", 1))], day(0));
  l = updateAdviceLedger(l, [], day(5));
  assert.equal(find(l, "a").status, "resolved");
  l = updateAdviceLedger(l, [sighting("a", snap("poas", 3))], day(6));
  const r = find(l, "a");
  assert.equal(r.status, "open");
  assert.equal(r.reopenedCount, 1);
  assert.equal(r.timesSeen, 2, "timesSeen keeps counting across the reopen");
  assert.equal(r.resolvedAt, undefined, "the stale resolve is gone");
  assert.equal(r.outcome, undefined, "and so is the outcome it justified");
  assert.equal(r.snapshot.firstValue, 1, "the BASELINE survives a reopen — it is the first sight, once");
  assert.equal(r.snapshot.lastValue, 3);
  assert.equal(r.firstSeenAt, day(0).toISOString());
});

// --- dismissed --------------------------------------------------------------

test("a dismissed subject keeps being counted but is never machine-resolved", () => {
  let l = updateAdviceLedger(null, [sighting("d", snap("poas", 1))], day(0));
  l = { ...l, records: l.records.map((r) => ({ ...r, status: "dismissed", dismissedAt: day(0).toISOString() })) };
  l = updateAdviceLedger(l, [sighting("d", snap("poas", 1))], day(1));
  assert.equal(find(l, "d").status, "dismissed", "still seeing it does not un-dismiss it");
  assert.equal(find(l, "d").timesSeen, 2);
  l = updateAdviceLedger(l, [], day(9));
  assert.equal(find(l, "d").status, "dismissed", "the clock owns 'resolved', not 'dismissed'");
  assert.deepEqual([...dismissedSubjectKeys(l)], ["d"]);
});

// --- cap eviction -----------------------------------------------------------

test("eviction takes the oldest RESOLVED first and never an open record while one remains", () => {
  // CAP resolved records (oldest first), then one more open one → the oldest resolved goes.
  const records = [];
  for (let i = 0; i < ADVICE_LEDGER_CAP; i++) {
    records.push({
      subjectKey: `r${String(i).padStart(3, "0")}`,
      module: "m",
      severity: "info",
      title: "t",
      firstSeenAt: day(0).toISOString(),
      lastSeenAt: day(0).toISOString(),
      timesSeen: 1,
      reopenedCount: 0,
      status: "resolved",
      resolvedAt: new Date(Date.parse(T0) + i * 1000).toISOString(),
    });
  }
  const before = { records, updatedAt: T0 };
  const after = updateAdviceLedger(before, [sighting("fresh-open")], day(0));
  assert.equal(after.records.length, ADVICE_LEDGER_CAP);
  assert.ok(find(after, "fresh-open"), "the new open record is kept");
  assert.equal(find(after, "r000"), undefined, "the oldest resolved record was evicted");
  assert.ok(find(after, "r199"), "the newest resolved record survived");
});

test("with nothing settled to drop, the OLDEST open record goes — never a newer one", () => {
  const records = [];
  for (let i = 0; i < ADVICE_LEDGER_CAP; i++) {
    records.push({
      subjectKey: `o${String(i).padStart(3, "0")}`,
      module: "m",
      severity: "info",
      title: "t",
      firstSeenAt: T0,
      lastSeenAt: new Date(Date.parse(T0) + i * 1000).toISOString(),
      timesSeen: 1,
      reopenedCount: 0,
      status: "open",
    });
  }
  // day(1) so the newcomer's lastSeenAt genuinely postdates every o### row, and so the
  // 3-day resolve clock has not yet fired on any of them (this is an EVICTION test).
  const after = updateAdviceLedger({ records, updatedAt: T0 }, [sighting("newest")], day(1));
  assert.equal(after.records.length, ADVICE_LEDGER_CAP);
  assert.ok(after.records.every((r) => r.status === "open"), "nothing resolved — pure eviction");
  assert.equal(find(after, "o000"), undefined);
  assert.ok(find(after, "newest") && find(after, "o199"));
});

// --- readers ----------------------------------------------------------------

test("recentAdviceOutcomes windows, orders newest-first and caps", () => {
  let l = updateAdviceLedger(
    null,
    [sighting("a", snap("poas", 1)), sighting("b", snap("poas", 1)), sighting("c", snap("poas", 1))],
    day(0)
  );
  l = updateAdviceLedger(l, [sighting("b", snap("poas", 5)), sighting("c", snap("poas", 5))], day(4));
  l = updateAdviceLedger(l, [sighting("c", snap("poas", 9))], day(8));
  l = updateAdviceLedger(l, [], day(12));
  // "a" resolved on day 4, "b" on day 8, "c" on day 12.
  assert.deepEqual(
    recentAdviceOutcomes(l, day(12), 7).map((r) => r.subjectKey),
    ["c", "b"],
    "only the last 7 days, newest resolve first"
  );
  assert.equal(recentAdviceOutcomes(l, day(12), 30, 1).length, 1, "the limit is honoured");
  assert.deepEqual(scoredAdviceOutcomes(l).map((r) => r.subjectKey), ["c", "b", "a"], "the window-free read");
});

test("adviceRecordFor finds one subject and tolerates a null ledger", () => {
  const l = updateAdviceLedger(null, [sighting("a")], day(0));
  assert.equal(adviceRecordFor(l, "a").subjectKey, "a");
  assert.equal(adviceRecordFor(l, "nope"), null);
  assert.equal(adviceRecordFor(null, "a"), null);
  assert.deepEqual([...dismissedSubjectKeys(null)], []);
  assert.deepEqual(recentAdviceOutcomes(undefined, day(0)), []);
});

test("a sighting with no subjectKey is dropped rather than tracked as ''", () => {
  const l = updateAdviceLedger(null, [sighting("a"), { subjectKey: "", module: "m", severity: "info", title: "t" }], day(0));
  assert.equal(l.records.length, 1);
});

// --- read tolerance ---------------------------------------------------------

test("sanitizeAdviceLedger drops junk records and defaults missing counters", () => {
  const l = sanitizeAdviceLedger({
    updatedAt: T0,
    records: [
      null,
      "nope",
      { module: "m" }, // no subjectKey
      { subjectKey: "dup", status: "open" },
      { subjectKey: "dup", status: "open" }, // duplicate key
      { subjectKey: "ok", status: "weird", timesSeen: "x", reopenedCount: -3, snapshot: { key: "poas", firstValue: "a", lastValue: 2 } },
    ],
  });
  assert.deepEqual(l.records.map((r) => r.subjectKey), ["dup", "ok"]);
  const ok = l.records[1];
  assert.equal(ok.status, "open", "an unknown status degrades to open, never to resolved");
  assert.equal(ok.timesSeen, 1);
  assert.equal(ok.reopenedCount, 0);
  assert.equal(ok.snapshot, undefined, "half a snapshot is no snapshot");
  assert.equal(ok.firstSeenAt, T0, "missing timestamps fall back to the blob's updatedAt");
});

test("sanitize refuses an outcome that has no baseline or sits on a sample record", () => {
  const outcome = { status: "improved", deltaPct: 0.9, at: T0 };
  const forged = sanitizeAdviceLedger({
    updatedAt: T0,
    records: [
      { subjectKey: "nobase", status: "resolved", resolvedAt: T0, outcome },
      { subjectKey: "sampled", status: "resolved", resolvedAt: T0, sample: true, outcome, snapshot: { key: "poas", firstValue: 1, lastValue: 2 } },
      { subjectKey: "good", status: "resolved", resolvedAt: T0, outcome, snapshot: { key: "poas", firstValue: 1, lastValue: 2 } },
    ],
  });
  assert.equal(forged.records[0].outcome, undefined, "no snapshot → no outcome survives the read");
  assert.equal(forged.records[1].outcome, undefined, "a sample record can never carry a verdict");
  assert.deepEqual(forged.records[2].outcome, outcome);
});

test("sanitize answers a non-ledger blob with null, never a throw", () => {
  for (const junk of [null, undefined, 7, "x", {}, { records: "no" }]) {
    assert.equal(sanitizeAdviceLedger(junk), null);
  }
});

test("a sanitized blob round-trips through updateAdviceLedger unchanged in identity", () => {
  const first = updateAdviceLedger(null, [sighting("a", snap("poas", 2))], day(0));
  const round = updateAdviceLedger(sanitizeAdviceLedger(JSON.parse(JSON.stringify(first))), [sighting("a", snap("poas", 2))], day(1));
  assert.equal(find(round, "a").timesSeen, 2);
  assert.equal(find(round, "a").snapshot.firstValue, 2);
});

test("updateAdviceLedger is pure — it never mutates the ledger handed to it", () => {
  const before = updateAdviceLedger(null, [sighting("a", snap("poas", 1))], day(0));
  const frozen = JSON.stringify(before);
  updateAdviceLedger(before, [sighting("a", snap("poas", 9)), sighting("b")], day(9));
  assert.equal(JSON.stringify(before), frozen, "mutateProjectState can re-run the mutation; it must be safe");
});

test("D() helper sanity: the fixture clock is what the assertions above assume", () => {
  assert.equal(D(T0).toISOString(), T0);
  assert.equal(day(3).toISOString(), "2026-08-04T09:00:00.000Z");
});
