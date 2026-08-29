/** WP F4 — the ledgers cron's step registry (src/lib/cron/ledgers.ts). Covers the
 *  three properties the shared cron slot rests on: the due-gate is a pure
 *  function of (now, lastRunAt); a step that throws is isolated and never stops a
 *  sibling; and the run folds into a `cron_runs` outcome that carries per-step
 *  counts AND each step's durable lastRunAt — which the next tick reads back. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEDGERS_CRON,
  LEDGER_STEPS,
  aggregateLedgerRun,
  heartbeatStep,
  lastRunsFromRecords,
  planLedgerSteps,
  runLedgerSteps,
} from "@/lib/cron/ledgers";

const NOW = new Date("2026-08-29T12:30:00.000Z");
const CTX = { now: NOW, startedAt: NOW };

/** A step whose behaviour the test dictates. */
const step = (id, { due = () => true, run } = {}) => ({
  id,
  due,
  run: run ?? (async () => ({ ok: true, counts: { did: 1 } })),
});

test("planLedgerSteps: only the due steps, decided from (now, lastRunAt)", () => {
  const hourly = step("hourly", {
    due: (now, lastRunAt) => lastRunAt === null || now.getTime() - Date.parse(lastRunAt) >= 3_600_000,
  });
  const never = step("never", { due: () => false });
  const always = step("always");
  const steps = [hourly, never, always];

  // Never ran → due. Ran 90 min ago → due. Ran 10 min ago → not due.
  assert.deepEqual(
    planLedgerSteps(steps, NOW, {}).map((s) => s.id),
    ["hourly", "always"]
  );
  assert.deepEqual(
    planLedgerSteps(steps, NOW, { hourly: "2026-08-29T11:00:00.000Z" }).map((s) => s.id),
    ["hourly", "always"]
  );
  assert.deepEqual(
    planLedgerSteps(steps, NOW, { hourly: "2026-08-29T12:20:00.000Z" }).map((s) => s.id),
    ["always"]
  );
});

test("planLedgerSteps: a due() that THROWS skips its own step, not the tick", () => {
  const boom = step("boom", {
    due: () => {
      throw new Error("bad predicate");
    },
  });
  assert.deepEqual(
    planLedgerSteps([step("a"), boom, step("b")], NOW, {}).map((s) => s.id),
    ["a", "b"]
  );
});

test("runLedgerSteps: [ok, throwing, ok] yields 3 rows, 1 error, and the run continues", async () => {
  const ran = [];
  const steps = [
    step("first", {
      run: async () => {
        ran.push("first");
        return { ok: true, counts: { drained: 3 } };
      },
    }),
    step("boom", {
      run: async () => {
        ran.push("boom");
        throw new Error("step exploded");
      },
    }),
    step("third", {
      run: async () => {
        ran.push("third");
        return { ok: true, counts: { drained: 4 } };
      },
    }),
  ];

  const rows = await runLedgerSteps(steps, CTX);

  assert.deepEqual(ran, ["first", "boom", "third"], "every step still ran, in order");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.step),
    ["first", "boom", "third"]
  );
  const failed = rows.filter((r) => !r.ok);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].step, "boom");
  assert.equal(failed[0].error, "step exploded");
  assert.deepEqual(failed[0].counts, {}, "a thrown step contributes no counts");
  // Even the failing step gets a lastRunAt — it DID run; only its work failed.
  for (const r of rows) assert.equal(r.lastRunAt, NOW.toISOString());
});

test("runLedgerSteps: a returned { ok: false } is a recorded failure, not a throw", async () => {
  const rows = await runLedgerSteps(
    [step("soft", { run: async () => ({ ok: false, counts: { retried: 2 }, error: "provider 503" }) }), step("after")],
    CTX
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].error, "provider 503");
  assert.deepEqual(rows[0].counts, { retried: 2 }, "counts from a soft failure are kept");
  assert.equal(rows[1].ok, true);
});

test("aggregateLedgerRun: per-step counts are namespaced and headline tallies add up", async () => {
  const registered = [step("a"), step("boom"), step("b"), step("idle", { due: () => false })];
  const rows = await runLedgerSteps(
    [
      registered[0],
      step("boom", {
        run: async () => {
          throw new Error("nope");
        },
      }),
      step("b", { run: async () => ({ ok: true, counts: { did: 7, failed: 1 } }) }),
    ],
    CTX
  );

  const agg = aggregateLedgerRun(registered, rows, { idle: "2026-08-29T09:00:00.000Z" });

  assert.equal(agg.ok, false, "one failing step makes the run not-ok");
  assert.deepEqual(agg.counts, {
    steps: 4,
    ran: 3,
    failed: 1,
    skipped: 1,
    "a.did": 1,
    // Two steps may use the same key name without colliding — that is the point
    // of the "<id>.<key>" namespace ("b.failed" vs the headline "failed").
    "b.did": 7,
    "b.failed": 1,
  });
  assert.equal(agg.errors.length, 1);
  assert.equal(agg.errors[0].step, "boom");
  assert.deepEqual(agg.steps, {
    a: { did: 1 },
    boom: { error: "nope" },
    b: { did: 7, failed: 1 },
  });
});

test("aggregateLedgerRun: a not-due step carries its previous lastRunAt forward", () => {
  const registered = [step("ran"), step("idle")];
  const rows = [{ step: "ran", ok: true, counts: { did: 1 }, lastRunAt: NOW.toISOString() }];

  const agg = aggregateLedgerRun(registered, rows, { idle: "2026-08-29T09:00:00.000Z" });
  const idle = agg.results.find((r) => r.step === "idle");

  assert.equal(idle.skipped, true);
  assert.equal(idle.ok, true, "not-due is not a failure");
  assert.equal(idle.lastRunAt, "2026-08-29T09:00:00.000Z", "the due-gate survives a tick it sat out");
  assert.equal(agg.ok, true);
  // A step with no history at all reads as null, i.e. "never ran".
  const fresh = aggregateLedgerRun([step("new")], [], {});
  assert.equal(fresh.results[0].lastRunAt, null);
});

test("aggregateLedgerRun: a row for an unregistered step is reported, not dropped", async () => {
  const rows = await runLedgerSteps([step("retired")], CTX);
  const agg = aggregateLedgerRun([step("current")], rows, {});
  assert.deepEqual(
    agg.results.map((r) => r.step).sort(),
    ["current", "retired"]
  );
  assert.deepEqual(agg.steps, { retired: { did: 1 } });
});

test("lastRunsFromRecords: the newest ledgers record wins; other crons are ignored", () => {
  const rec = (cron, finishedAt, results) => ({
    id: `${cron}_${finishedAt}`,
    cron,
    startedAt: finishedAt,
    finishedAt,
    durationMs: 0,
    ok: true,
    counts: {},
    results,
    errors: [],
    truncated: false,
  });

  const lastRuns = lastRunsFromRecords([
    rec("sync", "2026-08-29T12:00:00.000Z", [{ step: "heartbeat", lastRunAt: "1999-01-01T00:00:00.000Z" }]),
    rec("ledgers", "2026-08-29T11:30:00.000Z", [{ step: "heartbeat", lastRunAt: "2026-08-29T11:30:00.000Z" }]),
    rec("ledgers", "2026-08-29T12:30:00.000Z", [
      { step: "heartbeat", lastRunAt: "2026-08-29T12:30:00.000Z" },
      { step: "idle", skipped: true, lastRunAt: null },
      { step: "junk" }, // a row with no lastRunAt reads as never-ran
      null,
      "not-a-row",
      { lastRunAt: "2026-08-29T12:30:00.000Z" }, // no step id → ignored
    ]),
  ]);

  assert.deepEqual(lastRuns, {
    heartbeat: "2026-08-29T12:30:00.000Z",
    idle: null,
    junk: null,
  });
});

test("lastRunsFromRecords: no records at all → every step reads as never-ran", () => {
  assert.deepEqual(lastRunsFromRecords([]), {});
  // With no history every registered step reads as never-ran, so the plan is the
  // whole registry. Asserted as a SUPERSET of heartbeat rather than a frozen list:
  // a later WP registering a step (WP W1-E added `webhook-retry`) must not have to
  // edit this assertion to keep it true.
  const planned = planLedgerSteps(LEDGER_STEPS, NOW, lastRunsFromRecords([])).map((s) => s.id);
  assert.ok(planned.includes("heartbeat"));
  assert.equal(planned.length, LEDGER_STEPS.length, "nothing gates a step on a first run");
});

test("the shipped registry: heartbeat is always due and always succeeds", async () => {
  assert.equal(LEDGERS_CRON, "ledgers");
  // heartbeat is the pipe-proving step and must always be registered FIRST; the
  // rest of the registry grows as later WPs append (WP W1-E: `webhook-retry`).
  assert.equal(LEDGER_STEPS[0].id, "heartbeat");
  assert.ok(LEDGER_STEPS.map((s) => s.id).includes("webhook-retry"));
  // Every registered id must be unique and slash-free — it becomes a Firestore
  // document id via the `ledger-${id}` sent-guard kind.
  const ids = LEDGER_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "step ids are unique");
  for (const id of ids) assert.ok(!id.includes("/"), `step id ${id} must be slash-free`);

  assert.equal(heartbeatStep.due(NOW, null), true);
  assert.equal(heartbeatStep.due(NOW, NOW.toISOString()), true);

  // Run heartbeat ALONE: the business steps registered beside it reach real stores,
  // which belongs in each step's own suite (test-unit/outbound-retry-step.test.mjs),
  // not in the registry's. What is asserted here is the shape the recorder persists.
  const rows = await runLedgerSteps([heartbeatStep], CTX);
  const agg = aggregateLedgerRun([heartbeatStep], rows, {});
  assert.equal(agg.ok, true);
  assert.deepEqual(agg.steps, { heartbeat: { beats: 1 } });
  assert.deepEqual(agg.counts, { steps: 1, ran: 1, failed: 0, skipped: 0, "heartbeat.beats": 1 });
});
