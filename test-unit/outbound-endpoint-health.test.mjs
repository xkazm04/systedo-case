/** The webhook delivery log you can ACT on: endpoint standing derived from the log (not
 *  from the stamp the retry sweep never writes), the redeliver verb, and rotating a
 *  secret a server-key change made unreadable.
 *
 *  Pinned here:
 *   - `endpointHealth` spells idle / healthy / failing / dead / secret-unreadable
 *     apart, and "nothing matched" never reads as "every attempt failed";
 *   - `canRedeliver` refuses a row the queue still owns (`pending`, and the drain's
 *     `sending` claim) — a replay must never double-send a live row;
 *   - `buildRedelivery` clones the verbatim signed payload and event id into a NEW
 *     pending row with lineage (`redeliveryOf`) and no carried-over error;
 *   - `secretReadable` answers a boolean and flips when WEBHOOK_SECRET_KEY changes;
 *   - the POST redeliver verb is scoped to the owned project (another project's
 *     delivery id is a 404 and writes nothing), refuses a disabled endpoint (409), and
 *     appends one new row for a gave-up delivery (200);
 *   - GET /webhooks reports `secretReadable: false` after a key change;
 *   - `rotateDraftPayload` asks the server to re-mint ONE row only.
 *
 *  Real LOCAL_DB stores and the real route handlers; only the ownership guard is
 *  module-mocked. The redelivered endpoint is an IP literal the SSRF guard refuses, so
 *  the one attempt the route makes opens no socket. The pure module is imported per
 *  test so each case fails on its own while the module does not exist.
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-outbound-health-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
const KEY_A = "health-test-key-a";
process.env.WEBHOOK_SECRET_KEY = KEY_A;

const U = "u-health";
mock.module("@/lib/projects/api-guard", {
  namedExports: {
    requireOwnedProject: async (id) => ({
      uid: U,
      project: { id, name: "T", type: "eshop", accentColor: "#fff", createdAt: "x", updatedAt: "x" },
    }),
  },
});

const health = () => import("@/lib/outbound/endpoint-health");
const crypto = await import("@/lib/outbound/secret-crypto");
const { saveWebhookConfig } = await import("@/lib/outbound/config-store");
const store = await import("@/lib/outbound/delivery-store");

const t1 = "2026-09-20T08:00:00.000Z";
const t2 = "2026-09-21T08:00:00.000Z";
const t3 = "2026-09-22T08:00:00.000Z";
const t4 = "2026-09-23T08:00:00.000Z";

/** A log row as the client holds it (PublicDelivery's fields the health rule reads). */
const logRow = (status, at, over = {}) => ({
  id: `d-${status}-${at}`,
  endpointId: "e1",
  type: "alert.critical",
  status,
  attempts: status === "pending" ? 1 : status === "gave-up" ? 5 : 1,
  nextAt: status === "pending" ? t4 : null,
  createdAt: at,
  updatedAt: at,
  payloadBytes: 10,
  ...over,
});

const delivery = (over = {}) => ({
  id: "d1",
  userId: U,
  projectId: "p1",
  endpointId: "e1",
  eventId: "ev",
  type: "alert.critical",
  status: "gave-up",
  attempts: 5,
  nextAt: null,
  lastCode: 503,
  lastError: "x",
  createdAt: t1,
  updatedAt: t2,
  payload: '{"id":"ev","type":"alert.critical","body":"é ✓"}',
  ...over,
});

/* ── endpoint standing, derived from the log ──────────────────────────────────── */

test("failing: two failed attempts since the last success, last success kept apart from last attempt", async () => {
  const { endpointHealth } = await health();
  const log = [
    logRow("pending", t3, { lastError: "Cíl vrátil stav 503." }),
    logRow("pending", t2, { lastError: "Cíl vrátil stav 503." }),
    logRow("ok", t1),
    logRow("gave-up", t4, { endpointId: "e2" }), // another endpoint's row never counts
  ];
  assert.deepEqual(endpointHealth(log, "e1"), {
    state: "failing",
    consecutiveFailures: 2,
    lastSuccessAt: t1,
    lastAttemptAt: t3,
  });
});

test("idle: an empty log is not a failing one", async () => {
  const { endpointHealth } = await health();
  assert.deepEqual(endpointHealth([], "e1"), {
    state: "idle",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastAttemptAt: null,
  });
});

test("healthy after a retry success (the log, not the stamp), dead after three gave-ups", async () => {
  const { endpointHealth } = await health();
  const recovered = endpointHealth(
    [logRow("ok", t4, { attempts: 3 }), logRow("pending", t3, { attempts: 0 })],
    "e1"
  );
  assert.equal(recovered.state, "healthy");
  assert.equal(recovered.lastSuccessAt, t4);
  assert.equal(recovered.consecutiveFailures, 0);

  const dead = endpointHealth(
    [logRow("gave-up", t4), logRow("gave-up", t3), logRow("gave-up", t2), logRow("ok", t1)],
    "e1"
  );
  assert.equal(dead.state, "dead");
  assert.equal(dead.consecutiveFailures, 3);
  assert.equal(dead.lastSuccessAt, t1);
});

test("canRedeliver: terminal rows replay, rows the queue owns (pending, sending) do not", async () => {
  const { canRedeliver } = await health();
  assert.equal(canRedeliver({ status: "gave-up" }), true);
  assert.equal(canRedeliver({ status: "ok" }), true);
  assert.equal(canRedeliver({ status: "pending" }), false);
  assert.equal(canRedeliver({ status: "sending" }), false);
});

test("buildRedelivery: a NEW pending row, byte-identical payload, same event id, lineage, no error", async () => {
  const { buildRedelivery } = await health();
  const orig = delivery();
  const now = new Date("2026-09-24T12:00:00.000Z");
  const next = buildRedelivery(orig, { id: "d2", now });
  assert.equal(next.id, "d2");
  assert.equal(next.eventId, "ev");
  assert.equal(next.payload, orig.payload);
  assert.equal(next.attempts, 0);
  assert.equal(next.status, "pending");
  assert.equal(next.nextAt, now.toISOString());
  assert.equal(next.createdAt, now.toISOString());
  assert.equal(next.redeliveryOf, "d1");
  assert.equal(next.endpointId, "e1");
  assert.equal(next.projectId, "p1");
  assert.equal("lastError" in next, false);
  assert.equal("lastCode" in next, false);
  assert.equal("claim" in next, false);
});

/* ── the secret leg ───────────────────────────────────────────────────────────── */

test("secretReadable: true under the key that wrote it, false after the key changes, false for empty", async () => {
  const { secretReadable } = crypto;
  assert.equal(typeof secretReadable, "function");
  const blob = crypto.encryptSecret("s");
  assert.equal(secretReadable(blob), true);
  process.env.WEBHOOK_SECRET_KEY = "health-test-key-b";
  try {
    assert.equal(secretReadable(blob), false);
  } finally {
    process.env.WEBHOOK_SECRET_KEY = KEY_A;
  }
  assert.equal(secretReadable(""), false);
});

test("GET /webhooks after a key change reports secretReadable:false; health says secret-unreadable", async () => {
  const P = "p1-get";
  await saveWebhookConfig(U, P, {
    endpoints: [
      {
        id: "e1",
        url: "https://receiver.example.com/hook",
        events: "all",
        enabled: true,
        secretEnc: crypto.encryptSecret("plain"),
        createdAt: t1,
      },
    ],
  });
  const { GET } = await import("@/app/api/projects/[id]/webhooks/route.ts");
  const before = await (await GET(new Request(`https://x/api/projects/${P}/webhooks`), { params: Promise.resolve({ id: P }) })).json();
  assert.equal(before.endpoints[0].secretReadable, true);

  process.env.WEBHOOK_SECRET_KEY = "health-test-key-b";
  let after;
  try {
    after = await (await GET(new Request(`https://x/api/projects/${P}/webhooks`), { params: Promise.resolve({ id: P }) })).json();
  } finally {
    process.env.WEBHOOK_SECRET_KEY = KEY_A;
  }
  assert.equal(after.endpoints[0].hasSecret, true);
  assert.equal(after.endpoints[0].secretReadable, false);
  assert.equal(JSON.stringify(after).includes("plain"), false, "no secret bytes, ever");

  const { endpointHealth } = await health();
  assert.equal(endpointHealth([logRow("ok", t4)], "e1", { secretReadable: false }).state, "secret-unreadable");
});

/* ── the redeliver verb ───────────────────────────────────────────────────────── */

test("POST redeliver: another project's id is 404 and writes nothing; disabled is 409; gave-up is 200", async () => {
  await saveWebhookConfig(U, "p1", {
    endpoints: [
      // An IP literal the SSRF guard refuses before any socket: the attempt is real,
      // the network is not.
      { id: "e1", url: "https://127.0.0.1/hook", events: "all", enabled: true, secretEnc: crypto.encryptSecret("p"), createdAt: t1 },
      { id: "e2", url: "https://b.example.com/hook", events: "all", enabled: false, secretEnc: crypto.encryptSecret("p"), createdAt: t1 },
    ],
  });
  await store.appendDelivery(delivery({ id: "dX", projectId: "p2" }));
  await store.appendDelivery(delivery({ id: "dG" }));
  await store.appendDelivery(delivery({ id: "dD", endpointId: "e2" }));

  assert.equal(typeof store.getDelivery, "function");
  assert.equal(await store.getDelivery("p1", "dX"), null, "scoped to the project, not the id");
  assert.equal((await store.getDelivery("p1", "dG"))?.id, "dG");

  const { POST } = await import("@/app/api/projects/[id]/webhooks/deliveries/route.ts");
  const post = (body) =>
    POST(
      new Request("https://x/api/projects/p1/webhooks/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

  const count = async (p) => (await store.listDeliveries(p, 200)).length;
  const [p1Before, p2Before] = [await count("p1"), await count("p2")];

  const foreign = await post({ redeliver: "dX" });
  assert.equal(foreign.status, 404);
  assert.equal(await count("p1"), p1Before, "nothing appended");
  assert.equal(await count("p2"), p2Before, "nothing appended");

  const disabled = await post({ redeliver: "dD" });
  assert.equal(disabled.status, 409);
  assert.equal(await count("p1"), p1Before);

  const ok = await post({ redeliver: "dG" });
  assert.equal(ok.status, 200);
  const { delivery: pub } = await ok.json();
  assert.equal(pub.redeliveryOf, "dG");
  assert.notEqual(pub.id, "dG");
  assert.equal(pub.endpointId, "e1");
  assert.equal("payload" in pub, false, "the client view, not the row");
  assert.equal(await count("p1"), p1Before + 1);
  const original = await store.getDelivery("p1", "dG");
  assert.equal(original.status, "gave-up", "the original row is lineage, never rewritten");
  const fresh = await store.getDelivery("p1", pub.id);
  assert.equal(fresh.payload, original.payload);
  assert.equal(fresh.eventId, original.eventId);
  assert.equal(fresh.attempts, 1, "exactly one attempt was made");
});

/* ── rotate ───────────────────────────────────────────────────────────────────── */

test("rotateDraftPayload marks only the chosen row for a re-mint", async () => {
  const { rotateDraftPayload } = await health();
  const drafts = [
    { id: "e1", url: "https://a.example/h", events: "all", enabled: true },
    { id: "e2", url: "https://b.example/h", events: ["ping"], enabled: false },
  ];
  assert.deepEqual(rotateDraftPayload(drafts, "e2"), [
    { id: "e1", url: "https://a.example/h", events: "all", enabled: true },
    { id: "e2", url: "https://b.example/h", events: ["ping"], enabled: false, rotate: true },
  ]);
  assert.equal("rotate" in drafts[1], false, "the drafts themselves are not mutated");
});
