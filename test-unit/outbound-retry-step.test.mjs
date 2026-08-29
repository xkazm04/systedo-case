/** WP W1-E — the `webhook-retry` ledger step: what the ledgers cron actually does
 *  with the deliveries an inline attempt could not land.
 *
 *  Four properties are pinned because getting any of them wrong makes the queue
 *  either lossy or unbounded: it is due every tick, it retries ONLY what is due,
 *  it gives up at DELIVERY_MAX_ATTEMPTS, and it closes a delivery whose endpoint was
 *  deleted or switched off instead of retrying against nothing forever. Also pinned:
 *  the step is registered, so shipping it required no route or vercel.json change.
 *
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.WEBHOOK_SECRET_KEY = "retry-test-secret";

const { encryptSecret } = await import("@/lib/outbound/secret-crypto");

let configs = new Map();
let log = [];
const key = (u, p) => `${u}|${p}`;

mock.module("@/lib/outbound/config-store", {
  namedExports: {
    EMPTY_WEBHOOK_CONFIG: { endpoints: [] },
    getWebhookConfig: async (u, p) => configs.get(key(u, p)) ?? { endpoints: [] },
    saveWebhookConfig: async (u, p, cfg) => configs.set(key(u, p), cfg),
    clearWebhookConfig: async (u, p) => configs.delete(key(u, p)),
    listUserWebhookConfigs: async () => [],
  },
});

/** The pending sweep is DUE-filtered in the real backends; the fake reproduces that
 *  so this test exercises the step's behaviour, not a mock that hands it everything. */
mock.module("@/lib/outbound/delivery-store", {
  namedExports: {
    appendDelivery: async (d) => log.push({ ...d }),
    updateDelivery: async (projectId, id, patch) => {
      log = log.map((d) => (d.projectId === projectId && d.id === id ? { ...d, ...patch } : d));
    },
    listDeliveries: async (projectId) => log.filter((d) => d.projectId === projectId),
    listPendingDeliveries: async (now, limit = 100) =>
      log
        .filter((d) => d.status === "pending" && d.nextAt !== null && d.nextAt <= now.toISOString())
        .slice(0, limit),
    clearDeliveries: async (projectId) => {
      log = log.filter((d) => d.projectId !== projectId);
    },
  },
});

/** The step calls the REAL sender (it exposes no transport seam of its own — the
 *  cron has nothing to inject through), so the sender module is mocked instead. The
 *  guard itself has its own suite (outbound-send-guard.test.mjs); here we only need
 *  to choose the answer the receiver gives. Declared BEFORE the imports below, or the
 *  step would capture the real module. */
let answer = 200;
let sends = 0;

mock.module("@/lib/outbound/send", {
  namedExports: {
    OUTBOUND_TIMEOUT_MS: 12_000,
    validateWebhookUrl: (raw) => new URL(raw),
    deliveryHeaders: () => ({}),
    nodeTransport: async () => ({ status: answer }),
    postGuarded: async () => {
      sends++;
      return answer >= 200 && answer < 300
        ? { ok: true, code: answer }
        : { ok: false, code: answer, error: `Cíl vrátil stav ${answer}.` };
    },
  },
});

const { runWebhookRetries, webhookRetryStep, WEBHOOK_RETRY_STEP_ID, RETRY_BATCH } = await import(
  "@/lib/outbound/retry-step"
);
const { LEDGER_STEPS, planLedgerSteps, aggregateLedgerRun, runLedgerSteps } = await import(
  "@/lib/cron/ledgers"
);
const { backoffMs, DELIVERY_MAX_ATTEMPTS } = await import("@/lib/outbound/types");

const U = "u1";
const P = "p1";
const NOW = new Date("2026-08-29T12:00:00.000Z");

const endpoint = (over = {}) => ({
  id: "e1",
  url: "https://receiver.example.com/hook",
  events: "all",
  enabled: true,
  secretEnc: encryptSecret("plain"),
  createdAt: NOW.toISOString(),
  ...over,
});

const pending = (over = {}) => ({
  id: "d1",
  userId: U,
  projectId: P,
  endpointId: "e1",
  eventId: "ev1",
  type: "alert.critical",
  status: "pending",
  attempts: 1,
  nextAt: "2026-08-29T11:00:00.000Z",
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T11:00:00.000Z",
  payload: '{"id":"ev1","type":"alert.critical"}',
  ...over,
});

function reset(endpoints = [endpoint()], deliveries = [pending()]) {
  configs = new Map();
  log = deliveries.map((d) => ({ ...d }));
  if (endpoints.length) configs.set(key(U, P), { endpoints });
}

/* ── registration ────────────────────────────────────────────────────────────── */

test("the step is REGISTERED in LEDGER_STEPS — that is the whole ceremony", () => {
  assert.ok(
    LEDGER_STEPS.some((s) => s.id === WEBHOOK_RETRY_STEP_ID),
    "webhook-retry must be in the ledgers registry"
  );
  assert.equal(webhookRetryStep.id, "webhook-retry");
  assert.ok(/^[a-z-]+$/.test(webhookRetryStep.id), "slash-free, kebab-case (a Firestore doc id)");
});

test("the step is due on every tick (the backoff lives on each delivery, not here)", () => {
  assert.equal(webhookRetryStep.due(NOW, null), true);
  assert.equal(webhookRetryStep.due(NOW, NOW.toISOString()), true);
  const due = planLedgerSteps(LEDGER_STEPS, NOW, {});
  assert.ok(due.some((s) => s.id === WEBHOOK_RETRY_STEP_ID));
});

/* ── what it retries ─────────────────────────────────────────────────────────── */

test("a DUE pending delivery is retried and, on success, closed", async () => {
  reset();
  answer = 200;
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(r.ok, true);
  assert.equal(sends, 1);
  assert.deepEqual(r.counts, { retried: 1, delivered: 1, failed: 0, gaveUp: 0, orphaned: 0 });
  assert.equal(log[0].status, "ok");
  assert.equal(log[0].nextAt, null);
  assert.equal(log[0].attempts, 2);
});

test("a NOT-YET-DUE delivery is left completely alone", async () => {
  reset([endpoint()], [pending({ nextAt: "2026-08-29T23:00:00.000Z" })]);
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(sends, 0);
  assert.equal(r.counts.retried, 0);
  assert.equal(log[0].status, "pending");
  assert.equal(log[0].attempts, 1, "its attempt counter must not move");
});

test("a terminal delivery is never picked up again", async () => {
  reset([endpoint()], [pending({ status: "ok", nextAt: null }), pending({ id: "d2", status: "gave-up", nextAt: null })]);
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(sends, 0);
  assert.equal(r.counts.retried, 0);
});

test("a failed retry re-schedules with the NEXT backoff step", async () => {
  reset();
  answer = 503;
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.deepEqual(r.counts, { retried: 1, delivered: 0, failed: 1, gaveUp: 0, orphaned: 0 });
  assert.equal(log[0].status, "pending");
  assert.equal(log[0].attempts, 2);
  assert.equal(log[0].nextAt, new Date(NOW.getTime() + backoffMs(2)).toISOString());
  assert.equal(log[0].lastCode, 503);
});

test("the LAST allowed attempt gives up instead of scheduling a sixth", async () => {
  reset([endpoint()], [pending({ attempts: DELIVERY_MAX_ATTEMPTS - 1 })]);
  answer = 500;
  const r = await runWebhookRetries(NOW);
  assert.deepEqual(r.counts, { retried: 1, delivered: 0, failed: 0, gaveUp: 1, orphaned: 0 });
  assert.equal(log[0].status, "gave-up");
  assert.equal(log[0].attempts, DELIVERY_MAX_ATTEMPTS);
  assert.equal(log[0].nextAt, null, "a gave-up delivery leaves the pending set for good");
});

/* ── orphans ─────────────────────────────────────────────────────────────────── */

test("a delivery whose endpoint was DELETED is closed, not retried forever", async () => {
  reset([], [pending()]);
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(sends, 0);
  assert.deepEqual(r.counts, { retried: 0, delivered: 0, failed: 0, gaveUp: 0, orphaned: 1 });
  assert.equal(log[0].status, "gave-up");
  assert.match(log[0].lastError, /smaz/);
});

test("a delivery whose endpoint was DISABLED is closed — 'off' means stop", async () => {
  reset([endpoint({ enabled: false })], [pending()]);
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(sends, 0);
  assert.equal(r.counts.orphaned, 1);
  assert.equal(log[0].status, "gave-up");
  assert.match(log[0].lastError, /vypnut/);
});

/* ── counts, isolation, bounds ───────────────────────────────────────────────── */

test("counts are namespaced under the step id in the run record", async () => {
  reset();
  answer = 200;
  const rows = await runLedgerSteps([webhookRetryStep], { now: NOW, startedAt: NOW });
  const agg = aggregateLedgerRun([webhookRetryStep], rows, {});
  assert.equal(agg.counts["webhook-retry.delivered"], 1);
  assert.equal(agg.counts["webhook-retry.retried"], 1);
  assert.deepEqual(agg.steps["webhook-retry"], {
    retried: 1,
    delivered: 1,
    failed: 0,
    gaveUp: 0,
    orphaned: 0,
  });
});

test("a batch of several deliveries is processed in one tick", async () => {
  reset(
    [endpoint()],
    [pending({ id: "a" }), pending({ id: "b" }), pending({ id: "c" })]
  );
  answer = 200;
  sends = 0;
  const r = await runWebhookRetries(NOW);
  assert.equal(r.counts.retried, 3);
  assert.equal(sends, 3);
  assert.ok(log.every((d) => d.status === "ok"));
});

test("the batch is bounded so one dead endpoint cannot eat the whole invocation", () => {
  assert.equal(RETRY_BATCH, 100);
});
