/** WP W1-E — the emit path: one event in, exactly one delivery per matching endpoint
 *  out, a log row for each, and a scheduled retry when the send fails.
 *
 *  The stores are module-mocked (in-memory), and the transport is injected, so this
 *  covers the choreography — order of writes, the filter, the never-throws contract,
 *  the tenant→project inverse — with no database and no socket.
 *
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.WEBHOOK_SECRET_KEY = "emit-test-secret";

const { encryptSecret } = await import("@/lib/outbound/secret-crypto");

/** In-memory stand-ins for the two stores. */
let configs = new Map(); // `${userId}|${projectId}` → WebhookConfig
let log = []; // Delivery[]
let configReadThrows = false;

const key = (u, p) => `${u}|${p}`;

mock.module("@/lib/outbound/config-store", {
  namedExports: {
    EMPTY_WEBHOOK_CONFIG: { endpoints: [] },
    getWebhookConfig: async (u, p) => {
      if (configReadThrows) throw new Error("simulated store failure");
      return configs.get(key(u, p)) ?? { endpoints: [] };
    },
    saveWebhookConfig: async (u, p, cfg) => {
      configs.set(key(u, p), cfg);
    },
    clearWebhookConfig: async (u, p) => {
      configs.delete(key(u, p));
    },
    listUserWebhookConfigs: async (u) =>
      [...configs.entries()]
        .filter(([k]) => k.startsWith(`${u}|`))
        .map(([k, config]) => ({ userId: u, projectId: k.split("|")[1], config })),
  },
});

mock.module("@/lib/outbound/delivery-store", {
  namedExports: {
    appendDelivery: async (d) => {
      log = log.filter((x) => !(x.projectId === d.projectId && x.id === d.id));
      log.push({ ...d });
    },
    updateDelivery: async (projectId, id, patch) => {
      log = log.map((d) => (d.projectId === projectId && d.id === id ? { ...d, ...patch } : d));
    },
    listDeliveries: async (projectId) => log.filter((d) => d.projectId === projectId),
    listPendingDeliveries: async () => log.filter((d) => d.status === "pending"),
    clearDeliveries: async (projectId) => {
      log = log.filter((d) => d.projectId !== projectId);
    },
  },
});

const { emitOutbound, emitOutboundForTenant, matchTenantProject, nextDeliveryState } = await import(
  "@/lib/outbound/emit"
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

function reset(endpoints = [endpoint()]) {
  configs = new Map();
  log = [];
  configReadThrows = false;
  if (endpoints.length) configs.set(key(U, P), { endpoints });
}

const ok = () => async () => ({ status: 200 });
const dead = () => async () => ({ status: 500 });

const EVENT = { type: "alert.critical", title: "3 kritické kampaně", body: "…" };

/* ── one emit, one delivery ──────────────────────────────────────────────────── */

test("an emit produces EXACTLY ONE delivery per matching endpoint", async () => {
  reset([endpoint(), endpoint({ id: "e2", url: "https://b.example/h" })]);
  const r = await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.equal(r.matched, 2);
  assert.equal(r.delivered, 2);
  assert.equal(r.pending, 0);
  assert.equal(log.length, 2);
  // Both carry the SAME event id — one event, two deliveries.
  assert.equal(new Set(log.map((d) => d.eventId)).size, 1);
  assert.equal(log[0].eventId, r.eventId);
});

test("the delivered payload is the signed event, stamped with id/at/projectId", async () => {
  reset();
  const r = await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  const body = JSON.parse(log[0].payload);
  assert.equal(body.id, r.eventId);
  assert.equal(body.at, NOW.toISOString());
  assert.equal(body.projectId, P);
  assert.equal(body.type, "alert.critical");
  assert.equal(body.title, EVENT.title);
});

test("a successful delivery is terminal: status ok, nextAt null, one attempt", async () => {
  reset();
  await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.equal(log[0].status, "ok");
  assert.equal(log[0].nextAt, null);
  assert.equal(log[0].attempts, 1);
  assert.equal(log[0].lastCode, 200);
});

test("a failed delivery stays pending and schedules the FIRST backoff", async () => {
  reset();
  const r = await emitOutbound(U, P, EVENT, { transport: dead(), now: NOW });
  assert.equal(r.delivered, 0);
  assert.equal(r.pending, 1);
  assert.equal(log[0].status, "pending");
  assert.equal(log[0].attempts, 1);
  assert.equal(log[0].lastCode, 500);
  assert.equal(log[0].nextAt, new Date(NOW.getTime() + backoffMs(1)).toISOString());
});

test("the endpoint is stamped with its last outcome", async () => {
  reset();
  await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.equal(configs.get(key(U, P)).endpoints[0].lastStatus, "ok");
  assert.equal(configs.get(key(U, P)).endpoints[0].lastDeliveryAt, NOW.toISOString());
  await emitOutbound(U, P, EVENT, { transport: dead(), now: NOW });
  assert.equal(configs.get(key(U, P)).endpoints[0].lastStatus, "failed");
});

/* ── the filter ──────────────────────────────────────────────────────────────── */

test("a DISABLED endpoint is skipped — no delivery, no log row", async () => {
  reset([endpoint({ enabled: false })]);
  const r = await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.deepEqual(r, { eventId: null, matched: 0, delivered: 0, pending: 0 });
  assert.equal(log.length, 0);
});

test("an endpoint's event filter is honoured", async () => {
  reset([endpoint({ events: ["digest.weekly"] })]);
  assert.equal((await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW })).matched, 0);
  const r = await emitOutbound(U, P, { ...EVENT, type: "digest.weekly" }, { transport: ok(), now: NOW });
  assert.equal(r.matched, 1);
});

test("a project with NO configuration emits nothing and writes nothing", async () => {
  reset([]);
  const r = await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.equal(r.matched, 0);
  assert.equal(log.length, 0);
});

/* ── never throws ────────────────────────────────────────────────────────────── */

test("a store failure is swallowed — the alert that triggered the emit is never harmed", async () => {
  reset();
  configReadThrows = true;
  const r = await emitOutbound(U, P, EVENT, { transport: ok(), now: NOW });
  assert.deepEqual(r, { eventId: null, matched: 0, delivered: 0, pending: 0 });
});

test("a transport that throws is swallowed and recorded as a pending retry", async () => {
  reset();
  const r = await emitOutbound(U, P, EVENT, {
    transport: async () => {
      throw new Error("ENOTFOUND receiver.example.com");
    },
    now: NOW,
  });
  assert.equal(r.pending, 1);
  assert.equal(log[0].status, "pending");
  assert.match(log[0].lastError, /ENOTFOUND/);
});

test("an undecryptable secret fails the delivery honestly instead of sending unsigned", async () => {
  reset([endpoint({ secretEnc: "v1.bogus.bogus.bogus.bogus" })]);
  let sent = 0;
  const r = await emitOutbound(U, P, EVENT, {
    transport: async () => {
      sent++;
      return { status: 200 };
    },
    now: NOW,
  });
  assert.equal(sent, 0, "nothing is sent without a signature");
  assert.equal(r.delivered, 0);
  assert.match(log[0].lastError, /WEBHOOK_SECRET_KEY/);
});

/* ── the state machine ───────────────────────────────────────────────────────── */

test("nextDeliveryState walks pending → pending → … → gave-up at the cap", () => {
  let d = {
    attempts: 0,
    projectId: P,
    id: "d",
    status: "pending",
    nextAt: NOW.toISOString(),
  };
  for (let i = 1; i < DELIVERY_MAX_ATTEMPTS; i++) {
    const patch = nextDeliveryState(d, { ok: false, code: 500, error: "boom" }, NOW);
    assert.equal(patch.status, "pending", `attempt ${i} keeps retrying`);
    assert.equal(patch.attempts, i);
    assert.equal(patch.nextAt, new Date(NOW.getTime() + backoffMs(i)).toISOString());
    d = { ...d, ...patch };
  }
  const last = nextDeliveryState(d, { ok: false, code: 500, error: "boom" }, NOW);
  assert.equal(last.attempts, DELIVERY_MAX_ATTEMPTS);
  assert.equal(last.status, "gave-up");
  assert.equal(last.nextAt, null);
});

test("nextDeliveryState clears the error on success", () => {
  const patch = nextDeliveryState({ attempts: 2, lastError: "boom" }, { ok: true, code: 204 }, NOW);
  assert.equal(patch.status, "ok");
  assert.equal(patch.nextAt, null);
  assert.equal(patch.lastError, undefined);
  assert.equal(patch.lastCode, 204);
});

/* ── the tenant inverse (the two campaign alert call sites) ──────────────────── */

test("matchTenantProject resolves a base tenant key to its project", () => {
  assert.equal(matchTenantProject("u1", "u_u1_proj_p1", ["p1", "p2"]), "p1");
});

test("matchTenantProject resolves an ACCOUNT-scoped tenant (ADR-0010 suffix)", () => {
  assert.equal(matchTenantProject("u1", "u_u1_proj_p1_1234567890", ["p1"]), "p1");
  assert.equal(matchTenantProject("u1", "u_u1_proj_p1_sklik", ["p1"]), "p1");
});

test("matchTenantProject prefers the LONGEST matching project id", () => {
  assert.equal(matchTenantProject("u1", "u_u1_proj_p1_x", ["p1", "p1_x"]), "p1_x");
});

test("matchTenantProject returns null for another user's or an unknown tenant", () => {
  assert.equal(matchTenantProject("u1", "u_u2_proj_p1", ["p1"]), null);
  assert.equal(matchTenantProject("u1", "u_u1_proj_nope", ["p1"]), null);
  assert.equal(matchTenantProject("u1", "sample", ["p1"]), null);
});

test("emitOutboundForTenant delivers through the resolved project", async () => {
  reset();
  const r = await emitOutboundForTenant(U, `u_${U}_proj_${P}`, EVENT, { transport: ok(), now: NOW });
  assert.equal(r.matched, 1);
  assert.equal(log[0].projectId, P);
  assert.equal(log[0].userId, U);
});

test("emitOutboundForTenant is a silent no-op when no project matches", async () => {
  reset();
  const r = await emitOutboundForTenant(U, "u_u1_proj_unknown", EVENT, { transport: ok(), now: NOW });
  assert.equal(r.matched, 0);
  assert.equal(log.length, 0);
});
