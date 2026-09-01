/** WP W1-E — the outbound bus works fully offline: the config blob store and the
 *  ROW-based delivery log run end-to-end against the LOCAL node:sqlite backend
 *  (tables `webhook_configs` / `webhook_deliveries`), exercising the REAL store
 *  functions through the LOCAL_DB dispatcher.
 *
 *  It also pins the two properties the cron depends on and a blob store could not
 *  give: the pending sweep is DUE-filtered across projects, and the log is capped so
 *  an endpoint that fails forever cannot grow the table without bound.
 *
 *  Temp-db pattern from campaigns-local-store.test.mjs.
 *
 *  Threat-model flows TM-09 and TM-14 (docs/security/threat-model.md § Credentials, by
 *  flow): `WEBHOOK_SECRET_KEY` is the key, and a tenant's outbound webhook secret is
 *  what rests behind it — set by the user, encrypted in the store, and used to sign the
 *  payload that leaves. This suite drives the real config store end to end with that
 *  key configured. `npm run threat:flows` ties the rows to this file. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-outbound-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.WEBHOOK_SECRET_KEY = "test-webhook-secret-key";

const { getWebhookConfig, saveWebhookConfig, clearWebhookConfig, listUserWebhookConfigs } =
  await import("@/lib/outbound/config-store");
const { appendDelivery, updateDelivery, listDeliveries, listPendingDeliveries, clearDeliveries } =
  await import("@/lib/outbound/delivery-store");
const { DELIVERY_LOG_CAP } = await import("@/lib/outbound/types");
const { encryptSecret, decryptSecret, hasWebhookCrypto, looksEncrypted, mintWebhookSecret } =
  await import("@/lib/outbound/secret-crypto");

const U = "u-outbound";
const P = "p-outbound";

const endpoint = (over = {}) => ({
  id: "e1",
  url: "https://example.com/hook",
  events: "all",
  enabled: true,
  secretEnc: encryptSecret("plain-secret"),
  createdAt: "2026-08-29T10:00:00.000Z",
  ...over,
});

const delivery = (over = {}) => ({
  id: "d1",
  userId: U,
  projectId: P,
  endpointId: "e1",
  eventId: "ev1",
  type: "ping",
  status: "pending",
  attempts: 0,
  nextAt: "2026-08-29T12:00:00.000Z",
  createdAt: "2026-08-29T12:00:00.000Z",
  updatedAt: "2026-08-29T12:00:00.000Z",
  payload: '{"id":"ev1"}',
  ...over,
});

/* ── secret at rest ──────────────────────────────────────────────────────────── */

test("secret-crypto: a minted secret round-trips through the v1 envelope", () => {
  assert.equal(hasWebhookCrypto(), true);
  const plain = mintWebhookSecret();
  assert.equal(plain.length, 64); // 32 random bytes, hex
  const blob = encryptSecret(plain);
  assert.equal(looksEncrypted(blob), true);
  assert.equal(blob.startsWith("v1."), true);
  assert.equal(decryptSecret(blob), plain);
});

test("secret-crypto: each encryption uses a FRESH salt, so two blobs differ", () => {
  const a = encryptSecret("same-secret");
  const b = encryptSecret("same-secret");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "same-secret");
  assert.equal(decryptSecret(b), "same-secret");
});

test("secret-crypto: a tampered or malformed blob decrypts to null, never throws", () => {
  const blob = encryptSecret("x");
  const parts = blob.split(".");
  parts[4] = Buffer.from("tampered").toString("base64");
  assert.equal(decryptSecret(parts.join(".")), null);
  assert.equal(decryptSecret("not-a-blob"), null);
  assert.equal(looksEncrypted("not-a-blob"), false);
  assert.equal(looksEncrypted(null), false);
});

/* ── config store ────────────────────────────────────────────────────────────── */

test("config store: an unsaved project reads as the empty config, not null", async () => {
  const cfg = await getWebhookConfig(U, "never-saved");
  assert.deepEqual(cfg, { endpoints: [] });
});

test("config store: save → get round-trips the endpoint list", async () => {
  await saveWebhookConfig(U, P, { endpoints: [endpoint(), endpoint({ id: "e2", url: "https://b.example/h" })] });
  const cfg = await getWebhookConfig(U, P);
  assert.equal(cfg.endpoints.length, 2);
  assert.equal(cfg.endpoints[1].url, "https://b.example/h");
  assert.equal(decryptSecret(cfg.endpoints[0].secretEnc), "plain-secret");
});

test("config store: save is an UPSERT (a second save replaces, never duplicates)", async () => {
  await saveWebhookConfig(U, P, { endpoints: [endpoint({ url: "https://c.example/h" })] });
  const cfg = await getWebhookConfig(U, P);
  assert.equal(cfg.endpoints.length, 1);
  assert.equal(cfg.endpoints[0].url, "https://c.example/h");
});

test("config store: listUserWebhookConfigs returns only THIS user's projects", async () => {
  await saveWebhookConfig(U, "p-second", { endpoints: [endpoint()] });
  await saveWebhookConfig("u-other", "p-other", { endpoints: [endpoint()] });
  const mine = await listUserWebhookConfigs(U);
  assert.deepEqual(mine.map((c) => c.projectId).sort(), ["p-outbound", "p-second"]);
  assert.equal((await listUserWebhookConfigs("u-other")).length, 1);
});

test("config store: clear removes the project's config", async () => {
  await clearWebhookConfig(U, "p-second");
  assert.deepEqual(await getWebhookConfig(U, "p-second"), { endpoints: [] });
  assert.equal((await listUserWebhookConfigs(U)).length, 1);
});

/* ── delivery log ────────────────────────────────────────────────────────────── */

test("delivery log: append → list returns the record, newest first", async () => {
  await appendDelivery(delivery({ id: "d1", createdAt: "2026-08-29T12:00:00.000Z" }));
  await appendDelivery(delivery({ id: "d2", createdAt: "2026-08-29T12:05:00.000Z" }));
  const rows = await listDeliveries(P, 10);
  assert.deepEqual(rows.map((r) => r.id), ["d2", "d1"]);
  assert.equal(rows[0].userId, U);
});

test("delivery log: append is idempotent by id (a re-append updates in place)", async () => {
  await appendDelivery(delivery({ id: "d2", createdAt: "2026-08-29T12:05:00.000Z", attempts: 3 }));
  const rows = await listDeliveries(P, 10);
  assert.equal(rows.filter((r) => r.id === "d2").length, 1);
  assert.equal(rows.find((r) => r.id === "d2").attempts, 3);
});

test("delivery log: update patches one record and leaves the rest alone", async () => {
  await updateDelivery(P, "d1", { status: "ok", nextAt: null, attempts: 1, lastCode: 204 });
  const rows = await listDeliveries(P, 10);
  const d1 = rows.find((r) => r.id === "d1");
  assert.equal(d1.status, "ok");
  assert.equal(d1.nextAt, null);
  assert.equal(d1.lastCode, 204);
  assert.equal(rows.find((r) => r.id === "d2").status, "pending");
});

test("delivery log: updating an evicted/unknown id is a no-op, not an error", async () => {
  await updateDelivery(P, "no-such-id", { status: "ok" });
  assert.equal((await listDeliveries(P, 10)).some((r) => r.id === "no-such-id"), false);
});

test("delivery log: the pending sweep returns only DUE rows, across projects", async () => {
  await appendDelivery(
    delivery({ id: "due", projectId: "p-sweep", nextAt: "2026-08-29T11:00:00.000Z" })
  );
  await appendDelivery(
    delivery({ id: "later", projectId: "p-sweep", nextAt: "2026-08-29T23:00:00.000Z" })
  );
  await appendDelivery(
    delivery({ id: "done", projectId: "p-sweep", status: "ok", nextAt: null })
  );
  const pending = await listPendingDeliveries(new Date("2026-08-29T12:30:00.000Z"), 50);
  const ids = pending.map((d) => d.id);
  assert.ok(ids.includes("due"), "a due delivery is swept");
  assert.ok(ids.includes("d2"), "a due delivery in ANOTHER project is swept too");
  assert.equal(ids.includes("later"), false, "a not-yet-due delivery is left alone");
  assert.equal(ids.includes("done"), false, "a terminal delivery never returns");
});

test("delivery log: the pending sweep honours its limit", async () => {
  const one = await listPendingDeliveries(new Date("2026-08-29T12:30:00.000Z"), 1);
  assert.equal(one.length, 1);
});

test("delivery log: the log is capped at DELIVERY_LOG_CAP newest per project", async () => {
  const capped = "p-cap";
  for (let i = 0; i < DELIVERY_LOG_CAP + 10; i++) {
    await appendDelivery(
      delivery({
        id: `c${String(i).padStart(4, "0")}`,
        projectId: capped,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      })
    );
  }
  const rows = await listDeliveries(capped, DELIVERY_LOG_CAP + 100);
  assert.equal(rows.length, DELIVERY_LOG_CAP);
  // The OLDEST were evicted, the newest survived.
  assert.equal(rows.some((r) => r.id === "c0000"), false);
  assert.equal(rows.some((r) => r.id === `c${String(DELIVERY_LOG_CAP + 9).padStart(4, "0")}`), true);
});

test("delivery log: clear drops one project's rows and no other's", async () => {
  await clearDeliveries("p-sweep");
  assert.equal((await listDeliveries("p-sweep", 10)).length, 0);
  assert.ok((await listDeliveries(P, 10)).length > 0);
});
