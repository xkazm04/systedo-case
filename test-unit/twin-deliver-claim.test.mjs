/** WP S2 — THE CLAIM, end to end and fully offline.
 *
 *  These run the REAL `deliverDraft` and the REAL send route against the REAL
 *  LOCAL_DB twin and lead stores. Only three things are stubbed, each for a reason:
 *  the session/project reads (so the guard is still the guard), `sendEmail` (so no
 *  test can ever put a message on a wire — the one thing this WP must never do by
 *  accident), and the two audit emitters (so the assertions can see them fire
 *  without dragging the ads connector and firebase-admin into a unit test).
 *
 *  What is pinned here is (1) that the route's manual path is byte-identical to what
 *  shipped before, (2) the two NEW gates — weekly cap and consent — refuse INSIDE the
 *  claim and never touch the connector, (3) the concurrent-claim invariant: two sends
 *  racing on `maxPerWeek: 1` produce exactly one `sent`, and (4) the revert path. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-twin-deliver-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
// Makes the `email` connector "configured" — its transport is mocked below, so
// nothing leaves this process.
process.env.RESEND_API_KEY = "re_test_key";
register("./json-loader.mjs", import.meta.url);

const OWNER = "u-owner";
const P = "p-deliver";
const project = {
  id: P,
  name: "Mionelo",
  type: "eshop",
  accentColor: "#0891b2",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/** Every mail this suite would have sent, and the switch that makes Resend refuse. */
const mail = { sent: [], ok: true };
mock.module("@/lib/email", {
  namedExports: {
    sendEmail: async (to, subject, html) => {
      mail.sent.push({ to, subject, html });
      return mail.ok;
    },
    sendWebhook: async () => false,
    summarizeDelivery: (o) => ({ delivered: o.filter(Boolean).length, failed: 0, shouldMarkSent: true }),
  },
});

const audit = { activity: [], outbound: [] };
mock.module("@/lib/activity/emit", {
  namedExports: { emitProjectActivity: async (uid, pid, entry) => void audit.activity.push({ uid, pid, entry }) },
});
mock.module("@/lib/outbound/emit", {
  namedExports: {
    emitOutbound: async (uid, pid, input) => {
      audit.outbound.push({ uid, pid, input });
      return { delivered: 0, pending: 0, endpoints: 0 };
    },
    emitOutboundForTenant: async () => ({ delivered: 0, pending: 0, endpoints: 0 }),
  },
});
mock.module("@/lib/session", { namedExports: { currentUserId: async () => OWNER } });
mock.module("@/lib/projects/store", {
  namedExports: { getProject: async (uid, id) => (uid === OWNER && id === P ? project : null) },
});

const { POST } = await import("@/app/api/projects/[id]/twin/send/route");
const { PATCH } = await import("@/app/api/projects/[id]/crm/contacts/[contactId]/route");
const { deliverDraft } = await import("@/lib/twin/deliver");
const { getTwin, saveTwin, clearTwin } = await import("@/lib/twin/store");
const { saveContact, getContact } = await import("@/lib/leads/store");

const params = { params: Promise.resolve({ id: P }) };
const send = (draftId) =>
  POST(
    new Request(`http://localhost/api/projects/${P}/twin/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draftId === undefined ? {} : { draftId }),
    }),
    params
  );

const draft = (patch = {}) => ({
  id: "d1",
  channel: "email",
  contact: "Jana N.",
  inbound: "Kolik to stojí?",
  reply: "Dobrý den, cena je 990 Kč.",
  questions: [],
  confidence: 90,
  risks: [],
  status: "approved",
  autoApproved: false,
  createdAt: "2026-08-20T08:00:00.000Z",
  ...patch,
});

const channel = (patch = {}) => ({
  channel: "email",
  enabled: true,
  autonomy: "assist",
  connector: "manual",
  autoThreshold: 80,
  ...patch,
});

async function seed(channels, drafts) {
  await clearTwin(P);
  await saveTwin(P, { voices: [], channels, facts: [], drafts });
  mail.sent.length = 0;
  audit.activity.length = 0;
  audit.outbound.length = 0;
}

/* ── the route's existing contract, unchanged ───────────────────────────────── */

test("ACCEPTANCE — the manual path is byte-identical to what shipped before", async () => {
  await seed([channel()], [draft()]);
  const res = await send("d1");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.delivered, false);
  assert.equal(body.mode, "manual");
  assert.equal(body.detail, "Zkopírujte text a odešlete ho svým kanálem — Adamant zprávu neodesílá.");
  assert.equal(typeof body.sentAt, "string");
  const stored = (await getTwin(P)).drafts[0];
  assert.equal(stored.status, "sent");
  assert.equal(stored.sentAt, body.sentAt, "the response reports the ONE minted stamp");
  assert.equal(mail.sent.length, 0, "the manual connector transmits nothing");
});

test("a second send of the same draft is idempotent and reports the ORIGINAL stamp", async () => {
  const first = await (await send("d1")).json();
  const again = await send("d1");
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), {
    ok: true,
    delivered: false,
    mode: "manual",
    detail: "Tento koncept už byl odeslán.",
    sentAt: first.sentAt,
  });
});

test("the 4xx vocabulary is unchanged: missing id, unknown draft, unapproved draft", async () => {
  await seed([channel()], [draft({ id: "d_pending", status: "pending" })]);
  assert.equal((await send(undefined)).status, 400);
  assert.equal((await send("nope")).status, 404);
  const conflictRes = await send("d_pending");
  assert.equal(conflictRes.status, 409);
  assert.equal((await conflictRes.json()).error, "Odeslat lze jen schválený koncept.");
});

test("an UNCONFIGURED connector refuses with the connector's own name", async () => {
  await seed([channel({ connector: "ghost" })], [draft()]);
  const out = await deliverDraft(OWNER, P, "d1", {
    connectorFor: () => ({ id: "ghost", label: "Duch", labelEn: "Ghost", channels: ["email"], configured: false, send: async () => assert.fail("must not send") }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.kind, "connector-unconfigured");
  assert.equal(out.info.connectorLabel, "Duch");
  assert.equal((await getTwin(P)).drafts[0].status, "approved", "a refusal never claims the draft");
});

/* ── the real e-mail connector ──────────────────────────────────────────────── */

test("ACCEPTANCE — an addressed draft on the email connector really sends", async () => {
  await seed([channel({ connector: "email" })], [draft({ to: "jana@example.cz" })]);
  const res = await send("d1");
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.delivered, true);
  assert.equal(body.mode, "api");
  assert.deepEqual(mail.sent.map((m) => [m.to, m.subject]), [["jana@example.cz", "Re: Kolik to stojí?"]]);
  assert.match(mail.sent[0].html, /990 Kč/);
  assert.equal((await getTwin(P)).drafts[0].status, "sent");
});

test("a draft with NO address is refused — a name is never mailed", async () => {
  await seed([channel({ connector: "email" })], [draft()]);
  const res = await send("d1");
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "Konceptu chybí doručovací adresa — bez ní nelze odeslat.");
  assert.equal(mail.sent.length, 0);
  assert.equal((await getTwin(P)).drafts[0].status, "approved");
});

test("a REFUSED provider throws, the claim is reverted, and the client gets no raw error", async () => {
  await seed([channel({ connector: "email" })], [draft({ to: "jana@example.cz" })]);
  mail.ok = false;
  const res = await send("d1");
  mail.ok = true;
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "Odeslání přes konektor selhalo.");
  assert.equal(body.code, "provider-error");
  const stored = (await getTwin(P)).drafts[0];
  assert.equal(stored.status, "approved", "the optimistic claim was reverted");
  assert.equal(stored.sentAt, undefined, "and its stamp was stripped");
});

/* ── the weekly cap ─────────────────────────────────────────────────────────── */

test("ACCEPTANCE — the weekly cap refuses INSIDE the claim, connector untouched", async () => {
  const already = draft({ id: "d_old", status: "sent", sentAt: new Date().toISOString() });
  await seed([channel({ connector: "email", maxPerWeek: 1 })], [already, draft({ to: "jana@example.cz" })]);
  const res = await send("d1");
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Týdenní limit tohoto kanálu je vyčerpaný \(1\/1\)/);
  assert.equal(mail.sent.length, 0, "a refusal never reaches the wire");
  assert.equal((await getTwin(P)).drafts.find((d) => d.id === "d1").status, "approved");
});

test("a send from LAST week does not consume this week's cap", async () => {
  const old = draft({ id: "d_old", status: "sent", sentAt: new Date(Date.now() - 14 * 86_400_000).toISOString() });
  await seed([channel({ connector: "email", maxPerWeek: 1 })], [old, draft({ to: "jana@example.cz" })]);
  assert.equal((await (await send("d1")).json()).delivered, true);
});

test("ACCEPTANCE — two CONCURRENT sends on maxPerWeek:1 produce exactly one `sent`", async () => {
  await seed(
    [channel({ connector: "email", maxPerWeek: 1 })],
    [draft({ id: "a", to: "a@example.cz" }), draft({ id: "b", to: "b@example.cz" })]
  );
  const [x, y] = await Promise.all([deliverDraft(OWNER, P, "a"), deliverDraft(OWNER, P, "b")]);
  const okCount = [x, y].filter((o) => o.ok).length;
  const capped = [x, y].filter((o) => !o.ok && o.kind === "cap-exceeded");
  assert.equal(okCount, 1, "exactly one claim won");
  assert.equal(capped.length, 1, "the loser is refused by the cap, not by a crash");
  assert.equal(mail.sent.length, 1, "and exactly one message left");
  const stored = await getTwin(P);
  assert.equal(stored.drafts.filter((d) => d.status === "sent").length, 1);
});

/* ── consent ────────────────────────────────────────────────────────────────── */

const contact = (patch = {}) => ({
  id: "c1",
  projectId: P,
  name: "Jana N.",
  email: "jana@example.cz",
  emailKey: "jana@example.cz",
  stage: "lead",
  stageEnteredAt: "2026-08-01T00:00:00.000Z",
  attribution: { source: "email" },
  consent: [],
  tags: [],
  firstSeenAt: "2026-08-01T00:00:00.000Z",
  lastActivityAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...patch,
});

test("ACCEPTANCE — consent fails CLOSED: no contact, then no record, then GRANTED ⇒ sent", async () => {
  const cfg = channel({ connector: "email", consentRequired: true });

  // (1) the gate is on and the draft is linked to nobody at all.
  await seed([cfg], [draft({ to: "jana@example.cz" })]);
  let res = await send("d1");
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /nemá zaznamenaný souhlas/);
  assert.equal(mail.sent.length, 0);

  // (2) linked to a real contact that has no consent record — still refused.
  await saveContact(P, contact());
  await seed([cfg], [draft({ to: "jana@example.cz", contactId: "c1" })]);
  res = await send("d1");
  assert.equal(res.status, 409);
  assert.equal(mail.sent.length, 0, "an absent record is not a permission");

  // (3) the operator records the grant through the CRM route…
  const patchRes = await PATCH(
    new Request(`http://localhost/api/projects/${P}/crm/contacts/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: { purpose: "marketing_email", granted: true, basis: "consent", evidenceText: "Souhlas z formuláře" },
      }),
    }),
    { params: Promise.resolve({ id: P, contactId: "c1" }) }
  );
  assert.equal(patchRes.status, 200);
  const patched = (await patchRes.json()).contact;
  assert.equal(patched.consent.length, 1);
  assert.equal(patched.consent[0].origin, "operator");
  assert.equal(patched.consent[0].evidenceText, "Souhlas z formuláře");

  // …and the very same draft now goes out.
  res = await send("d1");
  assert.equal((await res.json()).delivered, true);
  assert.equal(mail.sent.length, 1);
});

test("a WITHDRAWAL stamps the record in force and closes the gate again", async () => {
  const withdrawRes = await PATCH(
    new Request(`http://localhost/api/projects/${P}/crm/contacts/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: { purpose: "marketing_email", granted: false, basis: "consent" } }),
    }),
    { params: Promise.resolve({ id: P, contactId: "c1" }) }
  );
  assert.equal(withdrawRes.status, 200);
  const after = await getContact(P, "c1");
  assert.equal(after.consent.length, 2, "append-only: nothing was rewritten");
  assert.equal(typeof after.consent[0].withdrawnAt, "string", "the grant carries a withdrawal stamp");

  await seed([channel({ connector: "email", consentRequired: true })], [draft({ to: "jana@example.cz", contactId: "c1" })]);
  const res = await send("d1");
  assert.equal(res.status, 409);
  assert.equal(mail.sent.length, 0);
});

test("the consent PATCH refuses an unknown purpose and a non-boolean grant", async () => {
  const bad = (body) =>
    PATCH(
      new Request(`http://localhost/api/projects/${P}/crm/contacts/c1`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: P, contactId: "c1" }) }
    );
  assert.equal((await bad({ consent: { purpose: "spam_them", granted: true, basis: "consent" } })).status, 422);
  assert.equal((await bad({ consent: { purpose: "marketing_email", granted: "yes", basis: "consent" } })).status, 422);
  assert.equal((await bad({ consent: { purpose: "marketing_email", granted: true, basis: "vibes" } })).status, 422);
});

/* ── audit ──────────────────────────────────────────────────────────────────── */

test("a successful delivery leaves three trails: activity, twin.sent, and the CRM row", async () => {
  await saveContact(P, contact({ consent: [] }));
  await seed([channel({ connector: "email" })], [draft({ to: "jana@example.cz", contactId: "c1" })]);
  await send("d1");

  assert.equal(audit.activity.length, 1);
  assert.equal(audit.activity[0].entry.module, "schranka");
  assert.equal(audit.activity[0].entry.title, "Zpráva odeslána");
  assert.equal(audit.outbound.length, 1);
  assert.equal(audit.outbound[0].input.type, "twin.sent");
  assert.equal(audit.outbound[0].input.data.draftId, "d1");
  assert.equal(audit.outbound[0].input.data.delivered, true);

  const { listActivities } = await import("@/lib/leads/store");
  const timeline = await listActivities(P, "c1", 50);
  const row = timeline.find((a) => a.refs?.twinDraftId === "d1");
  assert.ok(row, "the contact's own timeline records the outbound message");
  assert.equal(row.kind, "outbound_message");
  assert.equal(row.actor.type, "twin");
});

test("a REFUSED send leaves no audit trail at all — nothing happened", async () => {
  await seed([channel({ connector: "email", maxPerWeek: 1 })], [
    draft({ id: "d_old", status: "sent", sentAt: new Date().toISOString() }),
    draft({ to: "jana@example.cz" }),
  ]);
  await send("d1");
  assert.equal(audit.activity.length, 0);
  assert.equal(audit.outbound.length, 0);
});
