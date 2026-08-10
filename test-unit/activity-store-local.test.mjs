/** The tenant activity feed on the LOCAL_DB backend (src/lib/campaigns/activity.ts
 *  → activity.local.ts, rows in the generic `tenant_docs` twin). The Firestore
 *  backend of the same store is covered by activity-store-firestore.test.mjs.
 *
 *  The bug being fenced: activity.ts imported `@/lib/firebase` unconditionally, so
 *  under `npm run dev:local` EVERY read threw — listActivity returned {ok:false},
 *  the aktivita page rendered "Data nedostupná" and never its documented seeded
 *  fallback — and every emitProjectActivity write was a silent no-op. The audit
 *  trail simply did not exist offline. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-activity-local-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { recordActivity, listActivity, listActivitySince } = await import("@/lib/campaigns/activity");

const T = "u_user-act_proj_p1";

test("[local] a fresh tenant reads as GENUINELY empty, not as an outage", async () => {
  const { records, ok } = await listActivity("u_user-act_proj_fresh");
  assert.equal(ok, true);
  assert.deepEqual(records, []);
});

test("[local] a recorded entry persists and reads back with its fields", async () => {
  await recordActivity(T, {
    kind: "budget_shift",
    title: "Přesun rozpočtu",
    detail: "Search · Brand +10 %",
    actor: "Vy",
    module: "kampane",
    severity: "info",
  });
  const { records, ok } = await listActivity(T);
  assert.equal(ok, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "Přesun rozpočtu");
  assert.equal(records[0].actor, "Vy");
  assert.equal(records[0].module, "kampane");
  assert.ok(records[0].id, "the backend assigns a stable id");
  assert.ok(Date.parse(records[0].at) > 0, "the row carries an ISO write timestamp");
});

test("[local] the publish taxonomy (incl. the simulated tag) survives the roundtrip", async () => {
  const tenant = `${T}_pub`;
  await recordActivity(tenant, {
    kind: "update",
    title: "Příspěvek publikován",
    detail: "LinkedIn",
    module: "obsah-plan",
    publishKind: "social_post",
    publishVia: "channel",
    publishSimulated: true,
  });
  const [row] = (await listActivity(tenant)).records;
  assert.equal(row.publishKind, "social_post");
  assert.equal(row.publishVia, "channel");
  assert.equal(row.publishSimulated, true);
});

test("[local] the feed is newest-first and honours the limit", async () => {
  const tenant = `${T}_order`;
  for (const n of ["one", "two", "three"]) {
    await recordActivity(tenant, { kind: "sync", title: n, detail: "" });
  }
  const { records } = await listActivity(tenant);
  assert.deepEqual(
    records.map((r) => r.title),
    ["three", "two", "one"],
    "same-millisecond writes keep insertion order reversed (rowid tie-break)"
  );
  assert.equal((await listActivity(tenant, 2)).records.length, 2);
});

test("[local] listActivitySince windows the feed, and an empty window is ok:true", async () => {
  const tenant = `${T}_since`;
  await recordActivity(tenant, { kind: "alert", title: "Upozornění", detail: "" });
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  const inWindow = await listActivitySince(tenant, past);
  assert.equal(inWindow.ok, true);
  assert.equal(inWindow.records.length, 1);

  const outOfWindow = await listActivitySince(tenant, future);
  assert.equal(outOfWindow.ok, true, "an empty window is emptiness, never an outage");
  assert.deepEqual(outOfWindow.records, []);
});

test("[local] feeds are tenant-isolated", async () => {
  const a = `${T}_iso_a`;
  const b = `${T}_iso_b`;
  await recordActivity(a, { kind: "sync", title: "A", detail: "" });
  assert.deepEqual((await listActivity(b)).records, []);
  assert.deepEqual((await listActivity(a)).records.map((r) => r.title), ["A"]);
});
