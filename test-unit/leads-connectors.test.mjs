/** The inbound connector abstraction (src/lib/leads/connectors/). The value here is
 *  HONESTY, so that is what is pinned: every registered connector carries cs+en copy
 *  and a caveat, `implemented: false` rows can never be connected, an unknown id
 *  degrades to `manual` at the write boundary, WhatsApp is marked `push_only`
 *  (Meta exposes no read endpoint at any tier), and a stub `pull` returns an error
 *  on the RESULT rather than throwing — one unready tenant must not abort a sweep. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  LEAD_CONNECTORS,
  leadConnectorFor,
  leadConnectorMetas,
  storableConnectorId,
  implementedConnectorIds,
} = await import("@/lib/leads/connectors/registry");
const { resolveIngestMode, connectionHealth, publicLeadConnection } = await import(
  "@/lib/leads/connectors/types"
);

const NOW = new Date("2026-08-22T10:00:00.000Z");

const conn = (over = {}) => ({
  connectorId: "csv",
  connectedAt: NOW.toISOString(),
  bodyRetention: "snippet",
  ...over,
});

test("every registered connector has cs+en copy and an honest caveat", () => {
  assert.ok(LEAD_CONNECTORS.length >= 6);
  for (const c of LEAD_CONNECTORS) {
    assert.ok(c.meta.label, `${c.meta.id} needs a cs label`);
    assert.ok(c.meta.labelEn, `${c.meta.id} needs an en label`);
    assert.ok(c.meta.caveat, `${c.meta.id} needs a cs caveat`);
    assert.ok(c.meta.caveatEn, `${c.meta.id} needs an en caveat`);
    assert.ok(c.meta.modes.length > 0, `${c.meta.id} must declare how it can be fed`);
    assert.equal(typeof c.configured, "function");
    assert.equal(typeof c.pull, "function");
  }
});

test("only the connectors that actually work claim to be implemented", () => {
  assert.deepEqual(implementedConnectorIds().sort(), ["csv", "manual"]);
  assert.equal(leadConnectorFor("gsheet").meta.implemented, false, "the Picker flow is not built yet");
  assert.equal(leadConnectorFor("gmail").meta.implemented, false);
  assert.equal(leadConnectorFor("whatsapp").meta.implemented, false);
  assert.equal(leadConnectorFor("linkedin").meta.implemented, false);
});

test("WhatsApp is push_only — the one place the polling baseline genuinely breaks", () => {
  const wa = leadConnectorFor("whatsapp").meta;
  assert.ok(wa.modes.includes("push_only"));
  assert.equal(wa.modes.includes("poll"), false, "Meta exposes no read endpoint at any tier");
  // …and the mode resolver reports it as such regardless of deployment.
  assert.equal(resolveIngestMode(wa, { hasWebhookSecret: true, localDb: false, publicBaseUrl: "https://x" }), "push_only");
  assert.equal(resolveIngestMode(wa, { hasWebhookSecret: false, localDb: true }), "push_only");
});

test("mode is DERIVED per deployment: a NAT'd / LOCAL_DB box always falls back to poll", () => {
  const gmail = leadConnectorFor("gmail").meta;
  assert.equal(
    resolveIngestMode(gmail, { hasWebhookSecret: true, localDb: false, publicBaseUrl: "https://adamant.app" }),
    "webhook"
  );
  assert.equal(resolveIngestMode(gmail, { hasWebhookSecret: true, localDb: true, publicBaseUrl: "https://x" }), "poll");
  assert.equal(resolveIngestMode(gmail, { hasWebhookSecret: false, localDb: false, publicBaseUrl: "https://x" }), "poll");
  assert.equal(resolveIngestMode(gmail, { hasWebhookSecret: true, localDb: false }), "poll");
});

test("storableConnectorId degrades unknown/unimplemented ids to manual AT THE WRITE boundary", () => {
  assert.equal(storableConnectorId("csv"), "csv");
  assert.equal(storableConnectorId("manual"), "manual");
  assert.equal(storableConnectorId("gsheet"), "manual", "not implemented → must not be stored as live");
  assert.equal(storableConnectorId("whatsapp"), "manual");
  assert.equal(storableConnectorId("totally-made-up"), "manual");
});

test("a stub pull answers on the RESULT, never throws (one tenant cannot kill a sweep)", async () => {
  for (const id of ["gsheet", "gmail", "whatsapp", "linkedin"]) {
    const c = leadConnectorFor(id);
    const r = await c.pull(conn({ connectorId: id }), { limit: 10, now: NOW, projectId: "p1" });
    assert.deepEqual(r.events, []);
    assert.equal(r.error, `${id}-not-implemented`);
    assert.equal(c.configured(), false, `${id} must not claim to be configured`);
  }
});

test("the client projection strips every secret and keeps the token as a boolean", () => {
  const meta = leadConnectorFor("gmail").meta;
  const stored = conn({
    connectorId: "gmail",
    tokenEnc: "v2.secret.blob",
    refreshTokenEnc: "v2.another.secret",
    webhookSecretEnc: "v2.hmac.secret",
    cursor: "history-999",
    config: { labelIds: ["INBOX"] },
    failCount: 1,
    lastError: "401",
  });
  const pub = publicLeadConnection(stored, meta, { localDb: false, publicBaseUrl: "https://adamant.app" }, NOW);

  assert.equal(pub.hasToken, true);
  assert.equal(pub.hasWebhook, true);
  assert.equal(pub.health, "degraded");
  assert.deepEqual(pub.config, { labelIds: ["INBOX"] });
  const serialised = JSON.stringify(pub);
  for (const secret of ["v2.secret.blob", "v2.another.secret", "v2.hmac.secret", "history-999"]) {
    assert.equal(serialised.includes(secret), false, `${secret} must never reach a client`);
  }
});

test("connection health reflects the failure ladder and an expired token", () => {
  assert.equal(connectionHealth(conn(), NOW), "connected");
  assert.equal(connectionHealth(conn({ failCount: 1 }), NOW), "degraded");
  assert.equal(connectionHealth(conn({ failCount: 3 }), NOW), "failing");
  assert.equal(
    connectionHealth(conn({ tokenExpiresAt: "2026-08-01T00:00:00.000Z" }), NOW),
    "expired"
  );
});

test("leadConnectorMetas is metadata only — no functions cross to the client", () => {
  const metas = leadConnectorMetas();
  assert.equal(metas.length, LEAD_CONNECTORS.length);
  for (const m of metas) {
    assert.equal(typeof m.pull, "undefined");
    assert.equal(typeof m.configured, "undefined");
  }
});

test("bodyRetention defaults to a minimising policy in the stored shape", () => {
  const meta = leadConnectorFor("csv").meta;
  const pub = publicLeadConnection(conn(), meta, { localDb: true }, NOW);
  assert.equal(pub.bodyRetention, "snippet", "a connector that can see a mailbox must not default to 'full'");
});
