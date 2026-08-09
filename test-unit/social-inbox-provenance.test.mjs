/** Direction: the inbox stops fabricating. The sample inbox messages are RESOLVED
 *  from code (labeled `sample: true`), never persisted into a tenant's store on
 *  read; legacy rows the old seed persisted unlabeled are lazily migrated (open →
 *  deleted, replied → merge-labeled); and a recorded reply carries its simulated
 *  provenance so the UI can say so. Runs the REAL store functions against the
 *  local tenant-docs backend (same harness as tenant-docs-local-store). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-social-inbox-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { listMessages, markReplied } = await import("@/lib/social/store");

const MESSAGES = "social_messages";
// Byte-identical to the first two fixtures in social/store.ts SAMPLE_MESSAGES —
// what the pre-provenance seed persisted into real tenants.
const LEGACY_FIXTURE_0 = {
  platform: "instagram",
  author: "Jana N.",
  kind: "comment",
  text: "Ahoj, kolik stojí ta směs ořechů z posledního příspěvku? 😍",
};
const LEGACY_FIXTURE_1 = {
  platform: "facebook",
  author: "Petr Svoboda",
  kind: "comment",
  text: "Máte chia semínka aktuálně skladem?",
};

test("resolve-don't-persist: an empty tenant sees labeled samples and its store stays empty", async () => {
  const tenant = "u_prov_empty";
  const messages = await listMessages(tenant);
  assert.equal(messages.length, 4, "the four illustrative samples are served");
  for (const m of messages) {
    assert.equal(m.sample, true, `sample "${m.id}" must carry its provenance label`);
    assert.equal(m.status, "open");
  }
  const rows = await (await tenantDocs()).listDocs(tenant, MESSAGES);
  assert.equal(rows.length, 0, "reading the inbox must not persist fixtures into the tenant's store");
});

test("migration: an untouched (open) legacy seeded row is deleted; the code-served labeled sample takes its place", async () => {
  const tenant = "u_prov_legacy_open";
  const store = await tenantDocs();
  await store.setDoc(tenant, MESSAGES, "sample_0", {
    ...LEGACY_FIXTURE_0,
    receivedAt: "2026-01-01T10:00:00.000Z",
    status: "open",
  });
  const messages = await listMessages(tenant);
  const m = messages.find((x) => x.id === "sample_0");
  assert.ok(m, "the sample is still shown (served from code)");
  assert.equal(m.sample, true, "…and labeled");
  assert.equal(
    await store.getDoc(tenant, MESSAGES, "sample_0"),
    undefined,
    "the unlabeled legacy row is removed from the tenant's store"
  );
});

test("migration: a REPLIED legacy seeded row is kept (the tenant's own record) and merge-labeled", async () => {
  const tenant = "u_prov_legacy_replied";
  const store = await tenantDocs();
  await store.setDoc(tenant, MESSAGES, "sample_1", {
    ...LEGACY_FIXTURE_1,
    receivedAt: "2026-01-02T09:00:00.000Z",
    status: "replied",
    reply: "Ano, skladem!",
  });
  const messages = await listMessages(tenant);
  const m = messages.find((x) => x.id === "sample_1");
  assert.ok(m);
  assert.equal(m.sample, true, "the kept row is labeled");
  assert.equal(m.status, "replied");
  assert.equal(m.reply, "Ano, skladem!", "the tenant's reply record survives");
  const doc = await store.getDoc(tenant, MESSAGES, "sample_1");
  assert.equal(doc?.sample, true, "the label is PERSISTED, not just decorated on read");
  // No duplicate: the code-served sample with the same id must not also appear.
  assert.equal(messages.filter((x) => x.id === "sample_1").length, 1);
});

test("a real (non-fixture) stored message is returned unlabeled", async () => {
  const tenant = "u_prov_real";
  const store = await tenantDocs();
  await store.setDoc(tenant, MESSAGES, "real_1", {
    platform: "facebook",
    author: "Skutečný Zákazník",
    kind: "dm",
    text: "Dobrý den, mám dotaz k objednávce č. 123.",
    receivedAt: "2026-08-01T08:00:00.000Z",
    status: "open",
  });
  const messages = await listMessages(tenant);
  const real = messages.find((x) => x.id === "real_1");
  assert.ok(real);
  assert.notEqual(real.sample, true, "a real message must never be sample-tagged");
});

test("markReplied on a code-served sample persists it ONCE, labeled, with the simulated-reply marker", async () => {
  const tenant = "u_prov_reply";
  const ok = await markReplied(tenant, "sample_2", "Děkujeme!", { simulated: true });
  assert.equal(ok, true);
  const store = await tenantDocs();
  const doc = await store.getDoc(tenant, MESSAGES, "sample_2");
  assert.ok(doc, "the replied sample is now persisted (the reply must survive)");
  assert.equal(doc.sample, true, "…and it is labeled");
  assert.equal(doc.status, "replied");
  assert.equal(doc.reply, "Děkujeme!");
  assert.equal(doc.replySimulated, true, "the reply records that it was simulated");
  const messages = await listMessages(tenant);
  assert.equal(messages.filter((x) => x.id === "sample_2").length, 1, "no duplicate after persisting");
  assert.equal(messages.find((x) => x.id === "sample_2").status, "replied");
});

test("markReplied on an unknown id still reports not-found", async () => {
  assert.equal(await markReplied("u_prov_404", "nope", "…", { simulated: true }), false);
});
