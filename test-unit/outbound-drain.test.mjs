/** The outbound OUTBOX: an emit only enqueues, one leased drain delivers.
 *
 *  Pinned here, against the REAL LOCAL_DB (node:sqlite) delivery store:
 *   - emit appends `pending` rows and does NO network I/O on the caller's path; the
 *     send is handed to `after()` (the post-response seam is module-mocked so the
 *     scheduled callback can be captured and run by hand);
 *   - the pending → sending transition is ONE conditional write — two claimers on the
 *     same due row elect exactly one — and it carries a holder + a dated lease;
 *   - completion is conditional on still holding the claim, so a slow worker that
 *     lost (or was reaped) cannot overwrite what the winner wrote;
 *   - a `sending` row whose lease passed is swept again (stuck-reaping); one whose
 *     lease is live is not;
 *   - two overlapping ledger ticks send a due delivery ONCE;
 *   - a delivery that succeeds after failing carries no stale `lastError`, and the
 *     Firestore patch maps a cleared field to the delete sentinel instead of dropping
 *     it (which `{ merge: true }` would read as "keep the old value").
 *
 *  Temp-db pattern from outbound-stores-local.test.mjs. Run with
 *  --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-outbound-drain-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.WEBHOOK_SECRET_KEY = "drain-test-secret";

/** `after()` from next/server, behind the bus's one post-response seam. Captured, not
 *  run: the test decides when "after the response" happens. */
let scheduled = [];
mock.module("@/lib/outbound/after-response", {
  namedExports: {
    scheduleAfterResponse: async (task) => {
      scheduled.push(task);
      return "after";
    },
  },
});

const { encryptSecret } = await import("@/lib/outbound/secret-crypto");
const { saveWebhookConfig } = await import("@/lib/outbound/config-store");
const store = await import("@/lib/outbound/delivery-store");
const { emitOutbound } = await import("@/lib/outbound/emit");
const { runWebhookRetries } = await import("@/lib/outbound/retry-step");
const { toFirestorePatch } = await import("@/lib/outbound/delivery-store.firestore");

const U = "u-drain";
const NOW = new Date("2026-09-24T12:00:00.000Z");
const LEASE = "2026-09-24T12:01:00.000Z";

const endpoint = (over = {}) => ({
  id: "e1",
  url: "https://receiver.example.com/hook",
  events: "all",
  enabled: true,
  secretEnc: encryptSecret("plain"),
  createdAt: NOW.toISOString(),
  ...over,
});

const row = (projectId, over = {}) => ({
  id: "d1",
  userId: U,
  projectId,
  endpointId: "e1",
  eventId: "ev1",
  type: "alert.critical",
  status: "pending",
  attempts: 0,
  nextAt: "2026-09-24T11:59:00.000Z",
  createdAt: "2026-09-24T11:59:00.000Z",
  updatedAt: "2026-09-24T11:59:00.000Z",
  payload: '{"id":"ev1","type":"alert.critical"}',
  ...over,
});

/** A transport spy with a scripted answer sequence (the last answer repeats). */
function spy(...answers) {
  const s = async () => {
    s.calls++;
    return { status: answers[Math.min(s.calls - 1, answers.length - 1)] };
  };
  s.calls = 0;
  return s;
}

const EVENT = { type: "alert.critical", title: "2 kritické kampaně", body: "…" };

/* ── emit enqueues; the drain delivers after the response ─────────────────────── */

test("emit only ENQUEUES: two pending rows due now, zero sends on the caller's path", async () => {
  const P = "p-emit";
  scheduled = [];
  await saveWebhookConfig(U, P, { endpoints: [endpoint(), endpoint({ id: "e2", url: "https://b.example/h" })] });
  const transport = spy(200);
  const r = await emitOutbound(U, P, EVENT, { transport, now: NOW });
  assert.equal(r.matched, 2);
  assert.equal(r.pending, 2);
  assert.equal(r.delivered, 0);
  assert.equal(transport.calls, 0, "no network I/O inside the emit");
  const rows = await store.listDeliveries(P);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((d) => d.status === "pending" && d.nextAt === NOW.toISOString()));
  assert.equal(scheduled.length, 1, "exactly one post-response drain is scheduled");

  // "After the response": the captured callback delivers both.
  await scheduled[0]();
  assert.equal(transport.calls, 2);
  const after = await store.listDeliveries(P);
  assert.ok(after.every((d) => d.status === "ok" && d.attempts === 1), JSON.stringify(after));
  assert.ok(after.every((d) => d.claim === undefined), "a completed row carries no claim");
});

test("inline mode (the test route) delivers in-request and reports delivered === matched", async () => {
  const P = "p-inline";
  scheduled = [];
  await saveWebhookConfig(U, P, { endpoints: [endpoint(), endpoint({ id: "e2", url: "https://b.example/h" })] });
  const transport = spy(200);
  const r = await emitOutbound(U, P, { type: "ping", title: "t", body: "b" }, { transport, now: NOW, inline: true });
  assert.equal(r.matched, 2);
  assert.equal(r.delivered, r.matched);
  assert.equal(r.pending, 0);
  assert.equal(transport.calls, 2);
  assert.equal(scheduled.length, 0, "inline mode schedules nothing");
});

/* ── the claim: one conditional write elects one sender ───────────────────────── */

test("two claims on the same due row: exactly one wins, and the row names it", async () => {
  const P = "p-claim";
  await store.appendDelivery(row(P));
  const [a, b] = await Promise.all([
    store.claimDelivery(P, "d1", "A", LEASE, NOW),
    store.claimDelivery(P, "d1", "B", LEASE, NOW),
  ]);
  assert.equal(Number(a) + Number(b), 1, `exactly one claim wins (a=${a}, b=${b})`);
  const winner = a ? "A" : "B";
  const [d] = await store.listDeliveries(P);
  assert.equal(d.status, "sending");
  assert.equal(d.claim?.holder, winner);
  assert.equal(d.nextAt, LEASE, "the lease deadline rides nextAt");
  await store.clearDeliveries(P);
});

test("a completion by a holder that LOST the claim is refused and changes nothing", async () => {
  const P = "p-complete";
  await store.appendDelivery(row(P));
  assert.equal(await store.claimDelivery(P, "d1", "A", LEASE, NOW), true);
  const before = (await store.listDeliveries(P))[0];
  const lost = await store.completeDelivery(P, "d1", "B", { status: "ok", nextAt: null, attempts: 1 });
  assert.equal(lost, false);
  assert.deepEqual((await store.listDeliveries(P))[0], before, "the winner's row is untouched");

  // …and a holder whose lease was REAPED by a later claimer loses the same way.
  const later = new Date("2026-09-24T12:05:00.000Z");
  assert.equal(await store.claimDelivery(P, "d1", "C", "2026-09-24T12:06:00.000Z", later), true);
  const reaped = (await store.listDeliveries(P))[0];
  assert.equal(await store.completeDelivery(P, "d1", "A", { status: "ok", nextAt: null }), false);
  assert.deepEqual((await store.listDeliveries(P))[0], reaped, "the reaper's row is untouched");

  // The live holder completes, and the claim is cleared.
  assert.equal(await store.completeDelivery(P, "d1", "C", { status: "ok", nextAt: null, attempts: 1 }), true);
  const done = (await store.listDeliveries(P))[0];
  assert.equal(done.status, "ok");
  assert.equal(done.claim, undefined);
  await store.clearDeliveries(P);
});

test("the sweep re-offers a sending row whose lease passed, never a live one or a terminal one", async () => {
  const P = "p-sweep";
  await store.appendDelivery(row(P, { id: "expired", status: "sending", nextAt: "2026-09-24T11:58:00.000Z", claim: { holder: "dead", until: "2026-09-24T11:58:00.000Z" } }));
  await store.appendDelivery(row(P, { id: "live", status: "sending", nextAt: "2026-09-24T12:30:00.000Z", claim: { holder: "busy", until: "2026-09-24T12:30:00.000Z" } }));
  await store.appendDelivery(row(P, { id: "done", status: "ok", nextAt: null }));
  await store.appendDelivery(row(P, { id: "gone", status: "gave-up", nextAt: null }));
  const ids = (await store.listPendingDeliveries(NOW, 50)).filter((d) => d.projectId === P).map((d) => d.id);
  assert.deepEqual(ids, ["expired"]);
  await store.clearDeliveries(P);
});

/* ── overlapping ledger ticks ─────────────────────────────────────────────────── */

test("two overlapping retry sweeps over ONE due delivery send it exactly once", async () => {
  const P = "p-overlap";
  await saveWebhookConfig(U, P, { endpoints: [endpoint()] });
  await store.appendDelivery(row(P, { attempts: 1 }));
  const transport = spy(200);
  const [r1, r2] = await Promise.all([
    runWebhookRetries(NOW, { transport }),
    runWebhookRetries(NOW, { transport }),
  ]);
  assert.equal(transport.calls, 1, "the claim is the election; the loser skips");
  assert.equal(r1.counts.retried + r2.counts.retried, 1);
  assert.equal(r1.counts.delivered + r2.counts.delivered, 1);
  const [d] = await store.listDeliveries(P);
  assert.equal(d.status, "ok");
  assert.equal(d.attempts, 2);
  await store.clearDeliveries(P);
});

/* ── a success clears the error, on both backends ─────────────────────────────── */

test("a delivery that fails once and then succeeds through the drain keeps no lastError", async () => {
  const P = "p-recover";
  scheduled = [];
  await saveWebhookConfig(U, P, { endpoints: [endpoint()] });
  const transport = spy(500, 200);
  await emitOutbound(U, P, EVENT, { transport, now: NOW });
  await scheduled[0]();
  const failed = (await store.listDeliveries(P))[0];
  assert.equal(failed.status, "pending");
  assert.ok(failed.lastError, "the first failure is recorded");

  const later = new Date(failed.nextAt);
  const r = await runWebhookRetries(later, { transport });
  assert.equal(r.counts.delivered, 1);
  const ok = (await store.listDeliveries(P))[0];
  assert.equal(ok.status, "ok");
  assert.equal("lastError" in ok, false, "no stale error under a delivered row");
  await store.clearDeliveries(P);
});

test("toFirestorePatch turns a cleared field into the delete sentinel instead of dropping it", () => {
  const DEL = Symbol("delete");
  assert.deepEqual(toFirestorePatch({ lastError: undefined, status: "ok" }, DEL), {
    status: "ok",
    lastError: DEL,
  });
});
