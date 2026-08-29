/** WP W3-C — the `conversion-rollup` ledger step: it recomputes every tenant's
 *  summary, PRUNES LAST (a prune that ran first would narrow the very window the
 *  rollup just read), isolates one tenant's failure from the rest, and registers
 *  itself in LEDGER_STEPS with the shape the runner expects.
 *
 *  The store and the state layer are mocked (no sqlite, no Firestore) so the step's
 *  ORDERING and failure isolation are unit-testable; the summarizer is the real one.
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const NOW = new Date("2026-08-30T09:15:00.000Z");

/** Everything the step does, in order — the proof that prune comes last. */
let calls = [];
let tenants = [];
let eventsByProject = {};
let failListFor = null;
let failSaveFor = null;
const saved = {};

mock.module("@/lib/leads/conversion-store", {
  namedExports: {
    listConversionTenants: async () => {
      calls.push("tenants");
      if (tenants instanceof Error) throw tenants;
      return tenants;
    },
    listConversionEvents: async (projectId) => {
      calls.push(`list:${projectId}`);
      if (failListFor === projectId) throw new Error("ledger unreadable");
      return eventsByProject[projectId] ?? [];
    },
    pruneConversionEvents: async (projectId) => {
      calls.push(`prune:${projectId}`);
      return projectId === "p1" ? 2 : 0;
    },
  },
});
mock.module("@/lib/leads/conversion-state", {
  namedExports: {
    saveConversionSummary: async (userId, projectId, summary) => {
      calls.push(`save:${projectId}`);
      if (failSaveFor === projectId) throw new Error("state write failed");
      saved[projectId] = summary;
      return summary;
    },
  },
});

const { CONVERSION_ROLLUP_STEP_ID, conversionRollupStep, runConversionRollup } = await import(
  "@/lib/leads/conversion-rollup-step"
);
const { LEDGER_STEPS, planLedgerSteps, runLedgerSteps, aggregateLedgerRun } = await import(
  "@/lib/cron/ledgers"
);

const ev = (id, kind, at, label, gclid) => ({
  id,
  contactId: id.split("_")[0],
  kind,
  at,
  sourceLabel: label,
  attribution: gclid ? { source: "google-ads", gclid } : { source: "organic" },
  value: null,
});

function reset() {
  calls = [];
  failListFor = null;
  failSaveFor = null;
  tenants = [
    { userId: "u1", projectId: "p1" },
    { userId: "u2", projectId: "p2" },
  ];
  eventsByProject = {
    p1: [
      ev("a_qualified", "qualified", "2026-08-29T00:00:00.000Z", "Google Ads", "G1"),
      ev("b_won", "won", "2026-08-25T00:00:00.000Z", "Google Ads", "G2"),
      ev("c_qualified", "qualified", "2026-08-20T00:00:00.000Z", "Organic", null),
      ev("d_won", "won", "2026-02-01T00:00:00.000Z", "Google Ads", "G3"), // outside 30d
    ],
    p2: [],
  };
}

test("rollup: recomputes each tenant's summary, then prunes — in that order", async () => {
  reset();
  const result = await runConversionRollup(NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { projects: 2, events30d: 3, pruned: 2, failed: 0 });
  assert.deepEqual(calls, [
    "tenants",
    "list:p1",
    "save:p1",
    "list:p2",
    "save:p2",
    "prune:p1",
    "prune:p2",
  ]);
});

test("rollup: the written summary is the real 30-day rollup, coverage included", async () => {
  reset();
  await runConversionRollup(NOW);
  assert.equal(saved.p1.qualified30d, 2);
  assert.equal(saved.p1.won30d, 1);
  assert.equal(saved.p1.gclidPct, 0.67, "2 of 3 in-window rows carry a click id");
  assert.deepEqual(saved.p1.bySource, [
    { sourceLabel: "Google Ads", qualified30d: 1, won30d: 1, gclidPct: 1 },
    { sourceLabel: "Organic", qualified30d: 1, won30d: 0, gclidPct: 0 },
  ]);
  assert.equal(saved.p1.updatedAt, NOW.toISOString());
  // a tenant with no rows still gets an honest empty summary, not a stale one
  assert.deepEqual(saved.p2.bySource, []);
  assert.equal(saved.p2.qualified30d, 0);
});

test("rollup: one tenant's failure never costs the others their rollup", async () => {
  reset();
  failListFor = "p1";
  const result = await runConversionRollup(NOW);
  assert.equal(result.ok, false, "a failed tenant is reported, not swallowed");
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.projects, 1, "p2 still rolled up");
  assert.ok(calls.includes("save:p2"));
  assert.ok(calls.includes("prune:p1"), "retention still runs for the failed tenant");
});

test("rollup: an unreadable work list degrades to { ok:false }, never a throw", async () => {
  reset();
  tenants = new Error("store down");
  const result = await runConversionRollup(NOW);
  assert.equal(result.ok, false);
  assert.match(result.error, /store down/);
  assert.deepEqual(result.counts, { projects: 0, events30d: 0, pruned: 0, failed: 0 });
});

test("the step is registered, always due, and folds into a cron_runs outcome", async () => {
  reset();
  assert.equal(CONVERSION_ROLLUP_STEP_ID, "conversion-rollup");
  assert.equal(conversionRollupStep.id, CONVERSION_ROLLUP_STEP_ID);
  assert.ok(
    LEDGER_STEPS.map((s) => s.id).includes(CONVERSION_ROLLUP_STEP_ID),
    "registered in LEDGER_STEPS — the whole registration ceremony"
  );
  // a rolling window has moved on every tick, so "due" is unconditional
  assert.equal(conversionRollupStep.due(NOW, null), true);
  assert.equal(conversionRollupStep.due(NOW, NOW.toISOString()), true);
  assert.deepEqual(
    planLedgerSteps([conversionRollupStep], NOW, {}).map((s) => s.id),
    ["conversion-rollup"]
  );

  const rows = await runLedgerSteps([conversionRollupStep], { now: NOW, startedAt: NOW });
  const agg = aggregateLedgerRun([conversionRollupStep], rows, {});
  assert.equal(agg.ok, true);
  assert.equal(agg.counts["conversion-rollup.projects"], 2);
  assert.equal(agg.counts["conversion-rollup.pruned"], 2);
  assert.equal(rows[0].lastRunAt, NOW.toISOString());
});
