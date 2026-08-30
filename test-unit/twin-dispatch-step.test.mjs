/** WP S2 — the `twin-dispatch` ledger step, end to end on the sqlite twin.
 *
 *  This is the arm that acts with NO human in the loop, so what matters most here is
 *  the list of things it refuses to do. The model is a fixture (so a confidence score
 *  is an input, not a hope) and the wire is a fixture connector (so nothing leaves the
 *  process), but the STORE, the tenant join, the autonomy gate, the delivery claim and
 *  every refusal are the real ones.
 *
 *  The autonomy axis lives here rather than in the delivery gate on purpose: an
 *  `assist` channel may still be delivered by a person clicking send (that is what
 *  assist means), and it is the DISPATCHER that must never act there on its own. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-twin-dispatch-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.RESEND_API_KEY = "re_test_key";
register("./json-loader.mjs", import.meta.url);

const OWNER = "u-dispatch";
const P = "p-dispatch";
const DEMO = "demo-eshop";
const project = {
  id: P,
  name: "Mionelo",
  type: "eshop",
  accentColor: "#0891b2",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

mock.module("@/lib/email", {
  namedExports: { sendEmail: async () => true, sendWebhook: async () => false, summarizeDelivery: () => ({ delivered: 0, failed: 0, shouldMarkSent: false }) },
});
mock.module("@/lib/activity/emit", { namedExports: { emitProjectActivity: async () => {} } });
mock.module("@/lib/outbound/emit", {
  namedExports: {
    emitOutbound: async () => ({ delivered: 0, pending: 0, endpoints: 0 }),
    emitOutboundForTenant: async () => ({ delivered: 0, pending: 0, endpoints: 0 }),
    // The ledger registry pulls the webhook retry step, which imports this too.
    attemptDelivery: async () => ({ ok: true }),
  },
});
mock.module("@/lib/projects/store", {
  namedExports: {
    getProject: async (uid, id) => (uid === OWNER && id === P ? project : null),
    listProjects: async () => [project],
  },
});

const { runTwinDispatch, twinDispatchStep, DISPATCH_INTERVAL_MS, TWIN_DISPATCH_STEP_ID } = await import(
  "@/lib/twin/dispatch-step"
);
const { getTwin, saveTwin, clearTwin, listTwinTenants } = await import("@/lib/twin/store");
const { LEDGER_STEPS } = await import("@/lib/cron/ledgers");
const { getDb } = await import("@/lib/db");
const { INBOUND_ID_PREFIX } = await import("@/lib/twin/inbound-id");

// The tenant join reads the real `projects` table — the step must never dispatch a
// twin whose owner it cannot establish.
for (const [id, uid] of [[P, OWNER], [DEMO, OWNER]]) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO projects (id, user_id, name, type, accent_color, created_at, updated_at)
       VALUES (?, ?, 'Mionelo', 'eshop', '#0891b2', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`
    )
    .run(id, uid);
}

/* ── fixtures ───────────────────────────────────────────────────────────────── */

const wire = { sent: [] };
const fixtureConnector = (id) =>
  id === "wire"
    ? {
        id: "wire",
        label: "Fixture",
        labelEn: "Fixture",
        channels: ["email", "leads"],
        configured: true,
        requiresAddress: true,
        send: async (p) => {
          wire.sent.push(p);
          return { delivered: true, mode: "api", detail: "ok" };
        },
      }
    : {
        id: "manual",
        label: "Ruční odeslání",
        labelEn: "Manual send",
        channels: ["leads", "email", "chat", "social", "reviews", "sms", "whatsapp"],
        configured: true,
        send: async () => ({ delivered: false, mode: "manual" }),
      };

/** A model that answers with a given confidence and risk list. */
const generator = (confidence, risks = []) => {
  const calls = [];
  return {
    calls,
    fn: async (req) => {
      calls.push(req);
      return {
        result: { reply: "Dobrý den, ano, skladem.", questions: ["Kam to poslat?"], confidence, risks, toneNotes: "" },
        meta: { model: "fixture", demo: false, tookMs: 1 },
      };
    },
  };
};

const inboundDraft = (id, patch = {}) => ({
  id: INBOUND_ID_PREFIX + id,
  channel: "email",
  contact: "Jana N.",
  inbound: "Máte to skladem?",
  reply: "",
  questions: [],
  confidence: 0,
  risks: ["inbound"],
  status: "pending",
  autoApproved: false,
  to: "jana@example.cz",
  createdAt: "2026-08-20T08:00:00.000Z",
  ...patch,
});

const channel = (patch = {}) => ({
  channel: "email",
  enabled: true,
  autonomy: "auto",
  connector: "wire",
  autoThreshold: 80,
  consentRequired: false,
  ...patch,
});

async function seed(projectId, channels, drafts) {
  await clearTwin(projectId);
  await saveTwin(projectId, { voices: [], channels, facts: [], drafts });
  wire.sent.length = 0;
}

const run = (gen, extra = {}) =>
  runTwinDispatch({
    connectorFor: fixtureConnector,
    anyRealConnector: () => true,
    generate: gen.fn,
    charge: async () => true,
    refund: async () => {},
    ...extra,
  });

/* ── registration + cadence ─────────────────────────────────────────────────── */

test("the step is registered in LEDGER_STEPS and is due at most every 30 minutes", () => {
  assert.ok(LEDGER_STEPS.some((s) => s.id === TWIN_DISPATCH_STEP_ID), "one line is the whole ceremony");
  assert.equal(DISPATCH_INTERVAL_MS, 30 * 60_000);
  const now = new Date("2026-08-30T12:00:00.000Z");
  assert.equal(twinDispatchStep.due(now, null), true, "never run ⇒ due");
  assert.equal(twinDispatchStep.due(now, "2026-08-30T11:45:00.000Z"), false, "15 minutes ago ⇒ not yet");
  assert.equal(twinDispatchStep.due(now, "2026-08-30T11:20:00.000Z"), true);
  assert.equal(twinDispatchStep.due(now, "not-a-date"), true, "an unreadable stamp must not wedge the step");
});

test("the tenant join returns (owner, project) pairs from the real tables", async () => {
  await seed(P, [channel()], []);
  const tenants = await listTwinTenants(50);
  assert.ok(tenants.some((t) => t.userId === OWNER && t.projectId === P));
});

/* ── the drafting arm ───────────────────────────────────────────────────────── */

test("ACCEPTANCE — a confident, risk-free draft is written, auto-approved AND delivered", async () => {
  await seed(P, [channel()], [inboundDraft("a")]);
  const gen = generator(95, []);
  const res = await run(gen);

  assert.equal(res.ok, true);
  assert.equal(res.counts.projects, 1);
  assert.equal(res.counts.drafted, 1);
  assert.equal(res.counts.approved, 1);
  assert.equal(res.counts.delivered, 1);
  assert.equal(res.counts.refused, 0);
  assert.equal(res.counts.failed, 0);

  assert.equal(gen.calls.length, 1);
  assert.equal(gen.calls[0].inbound, "Máte to skladem?");
  assert.equal(gen.calls[0].channel, "email");
  assert.equal(gen.calls[0].projectType, "eshop");

  const stored = (await getTwin(P)).drafts[0];
  assert.equal(stored.status, "sent");
  assert.equal(stored.autoApproved, true);
  assert.equal(stored.reply, "Dobrý den, ano, skladem.");
  assert.deepEqual(stored.risks, [], "the intake's placeholder risk is REPLACED, not merged");
  assert.equal(typeof stored.sentAt, "string");
  assert.deepEqual(wire.sent.map((p) => p.to), ["jana@example.cz"]);
});

test("a LOW-confidence draft is written but stays pending, and nothing is sent", async () => {
  await seed(P, [channel()], [inboundDraft("b")]);
  const res = await run(generator(60, []));
  assert.equal(res.counts.drafted, 1);
  assert.equal(res.counts.approved, 0);
  assert.equal(res.counts.delivered, 0);
  const stored = (await getTwin(P)).drafts[0];
  assert.equal(stored.status, "pending");
  assert.equal(stored.autoApproved, false);
  assert.equal(wire.sent.length, 0);
});

test("a RISK flagged by the model keeps a 100-confidence draft pending", async () => {
  await seed(P, [channel()], [inboundDraft("c")]);
  const res = await run(generator(100, ["Slibuje termín dodání."]));
  assert.equal(res.counts.approved, 0);
  assert.equal((await getTwin(P)).drafts[0].status, "pending");
  assert.equal(wire.sent.length, 0);
});

test("an exhausted spend ceiling stops the drafting arm without failing the step", async () => {
  await seed(P, [channel()], [inboundDraft("d")]);
  const gen = generator(95, []);
  const res = await run(gen, { charge: async () => false });
  assert.equal(res.ok, true);
  assert.equal(gen.calls.length, 0, "no provider call was made");
  assert.equal(res.counts.drafted, 0);
  assert.equal((await getTwin(P)).drafts[0].status, "pending");
});

test("a DEMO degradation refunds the reserved unit", async () => {
  await seed(P, [channel()], [inboundDraft("e")]);
  let refunds = 0;
  const gen = generator(95, []);
  const demoGen = { calls: gen.calls, fn: async (r) => ({ ...(await gen.fn(r)), meta: { model: "demo", demo: true, tookMs: 1 } }) };
  await run(demoGen, { refund: async () => void refunds++ });
  assert.equal(refunds, 1);
});

/* ── the refusals that make this safe ───────────────────────────────────────── */

test("ACCEPTANCE — an ASSIST channel is never drafted for and never sent on", async () => {
  await seed(P, [channel({ autonomy: "assist" })], [
    inboundDraft("f"),
    { ...inboundDraft("g"), reply: "schváleno člověkem", status: "approved", risks: [] },
  ]);
  const gen = generator(95, []);
  const res = await run(gen);
  assert.equal(res.counts.projects, 0, "the project has no dispatchable channel at all");
  assert.equal(gen.calls.length, 0);
  assert.equal(wire.sent.length, 0);
  assert.equal((await getTwin(P)).drafts.find((d) => d.status === "approved").status, "approved");
});

test("a REVIEW channel is likewise untouched", async () => {
  await seed(P, [channel({ autonomy: "review" })], [inboundDraft("h")]);
  const gen = generator(95, []);
  await run(gen);
  assert.equal(gen.calls.length, 0);
  assert.equal(wire.sent.length, 0);
});

test("an `auto` channel wired to MANUAL is not dispatchable — a recorded non-send is a lie", async () => {
  await seed(P, [channel({ connector: "manual" })], [inboundDraft("i")]);
  const gen = generator(95, []);
  const res = await run(gen);
  assert.equal(res.counts.projects, 0);
  assert.equal(gen.calls.length, 0);
});

test("a PENDING draft is never delivered, however confident it looks", async () => {
  await seed(P, [channel()], [
    { ...inboundDraft("j"), reply: "hotovo", status: "pending", confidence: 99, risks: [] },
  ]);
  const gen = generator(95, []);
  const res = await run(gen);
  assert.equal(gen.calls.length, 0, "it already has a reply — not an unanswered message");
  assert.equal(res.counts.delivered, 0);
  assert.equal(wire.sent.length, 0);
});

test("an OPERATOR-approved draft on an auto channel IS delivered — the operator approved it", async () => {
  await seed(P, [channel()], [
    { ...inboundDraft("k"), reply: "hotovo", status: "approved", autoApproved: false, risks: [] },
  ]);
  const res = await run(generator(95, []));
  assert.equal(res.counts.delivered, 1);
  assert.equal(wire.sent.length, 1);
  assert.equal((await getTwin(P)).drafts[0].status, "sent");
});

test("the weekly cap and the consent gate refuse inside the dispatcher too, and are COUNTED", async () => {
  await seed(P, [channel({ maxPerWeek: 1 })], [
    { ...inboundDraft("l"), reply: "x", status: "sent", autoApproved: true, risks: [], sentAt: new Date().toISOString() },
    { ...inboundDraft("m"), reply: "y", status: "approved", autoApproved: true, risks: [] },
  ]);
  let res = await run(generator(95, []));
  assert.equal(res.counts.delivered, 0);
  assert.equal(res.counts.refused, 1);
  assert.equal(wire.sent.length, 0);

  await seed(P, [channel({ consentRequired: true })], [
    { ...inboundDraft("n"), reply: "y", status: "approved", autoApproved: true, risks: [] },
  ]);
  res = await run(generator(95, []));
  assert.equal(res.counts.refused, 1, "no contactId ⇒ no consent ⇒ refused");
  assert.equal(wire.sent.length, 0);
});

test("a DEMO project is skipped entirely — the public demo mails nobody", async () => {
  await seed(DEMO, [channel()], [inboundDraft("o")]);
  await seed(P, [channel()], []);
  const gen = generator(95, []);
  await run(gen);
  assert.equal(gen.calls.length, 0);
  assert.equal(wire.sent.length, 0);
  assert.equal((await getTwin(DEMO)).drafts[0].status, "pending");
  await clearTwin(DEMO);
});

test("with NO real connector configured the step does no work at all and says so", async () => {
  await seed(P, [channel()], [inboundDraft("p")]);
  const gen = generator(95, []);
  const res = await runTwinDispatch({
    connectorFor: () => fixtureConnector("manual"),
    anyRealConnector: () => false,
    generate: gen.fn,
    charge: async () => true,
  });
  assert.deepEqual(res, { ok: true, counts: { projects: 0, drafted: 0, approved: 0, delivered: 0, refused: 0, failed: 0 } });
  assert.equal(gen.calls.length, 0);
});

test("at most DISPATCH_DRAFTS_PER_TICK messages are drafted per project per tick", async () => {
  const many = Array.from({ length: 8 }, (_, i) => inboundDraft(`q${i}`));
  await seed(P, [channel()], many);
  const gen = generator(50, []); // pending, so nothing is delivered and the count is clean
  const res = await run(gen);
  assert.equal(gen.calls.length, 5);
  assert.equal(res.counts.drafted, 5);
});
