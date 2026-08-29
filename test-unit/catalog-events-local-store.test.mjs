/** WP W1-A — the catalog change ledger's LOCAL_DB backend, driven through the real
 *  dispatcher (`@/lib/catalog/events-store`), so this proves the sqlite twin AND the
 *  dispatcher wiring in one pass: append is idempotent by event id, reads are
 *  newest-first, `key` filters to one SKU's history, the per-project cap evicts the
 *  oldest, and clear scrubs the project (the delete-cascade seam).
 *
 *  Harness: a temp db keyed by pid + SYSTEDO_DB_FILE + LOCAL_DB set BEFORE the dynamic
 *  import (the campaigns-local-store shape) — never the shared `.data/systedo.db`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-catalog-events-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { appendCatalogEvents, listCatalogEvents, clearCatalogEvents } = await import(
  "@/lib/catalog/events-store.ts"
);
const { CATALOG_EVENT_CAP, diffCatalogEvents } = await import("@/lib/catalog/events.ts");

const UID = "u_test";
const PID = "proj_ledger";

const ev = (at, key, kind, over = {}) => ({
  id: `${at}_${key}_${kind}`,
  at,
  key,
  name: `Item ${key}`,
  kind,
  actor: "manual",
  ...over,
});

test("appendCatalogEvents: writes a batch and reads it back NEWEST FIRST", async () => {
  await appendCatalogEvents(UID, PID, [
    ev("2026-08-01T00:00:00.000Z", "S1", "added"),
    ev("2026-08-02T00:00:00.000Z", "S1", "price", { before: 100, after: 120 }),
    ev("2026-08-03T00:00:00.000Z", "S2", "added"),
  ]);
  const rows = await listCatalogEvents(UID, PID);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.at),
    [
      "2026-08-03T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    ]
  );
  // the whole record round-trips, not just the indexed columns
  assert.equal(rows[1].before, 100);
  assert.equal(rows[1].after, 120);
  assert.equal(rows[1].actor, "manual");
});

test("appendCatalogEvents: re-appending the same batch is idempotent (stable ids)", async () => {
  await appendCatalogEvents(UID, PID, [
    ev("2026-08-02T00:00:00.000Z", "S1", "price", { before: 100, after: 120 }),
  ]);
  assert.equal((await listCatalogEvents(UID, PID)).length, 3, "no duplicate rows");
});

test("appendCatalogEvents: an empty batch is a no-op", async () => {
  await appendCatalogEvents(UID, PID, []);
  assert.equal((await listCatalogEvents(UID, PID)).length, 3);
});

test("listCatalogEvents: `key` filters to one offering's history, `limit` bounds it", async () => {
  const s1 = await listCatalogEvents(UID, PID, { key: "S1" });
  assert.equal(s1.length, 2);
  assert.ok(s1.every((r) => r.key === "S1"));
  assert.equal(s1[0].kind, "price", "still newest first inside the filter");
  assert.equal((await listCatalogEvents(UID, PID, { limit: 1 })).length, 1);
  assert.equal((await listCatalogEvents(UID, PID, { key: "nope" })).length, 0);
});

test("the ledger is per-(user, project) — another tenant sees nothing (ADR-0002)", async () => {
  assert.equal((await listCatalogEvents("u_other", PID)).length, 0);
  assert.equal((await listCatalogEvents(UID, "proj_other")).length, 0);
});

test("appendCatalogEvents: the cap evicts the OLDEST rows, keeping the newest", async () => {
  const capPid = "proj_cap";
  // strictly increasing timestamps, so "oldest" is unambiguous under the ORDER BY
  const at = (i) => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString();
  const batch = Array.from({ length: CATALOG_EVENT_CAP + 5 }, (_, i) => ev(at(i), `K${i}`, "added"));
  await appendCatalogEvents(UID, capPid, batch);
  const rows = await listCatalogEvents(UID, capPid, { limit: CATALOG_EVENT_CAP + 50 });
  assert.equal(rows.length, CATALOG_EVENT_CAP);
  const keys = new Set(rows.map((r) => r.key));
  assert.equal(keys.has("K0"), false, "the five oldest were evicted");
  assert.equal(keys.has("K4"), false);
  assert.equal(keys.has(`K${CATALOG_EVENT_CAP + 4}`), true, "the newest survived");
  await clearCatalogEvents(UID, capPid);
});

test("a real diff batch persists end-to-end through the store", async () => {
  const base = {
    kind: "product", id: "p:S9", projectId: PID, name: "Termoska", category: "C", active: true,
    nature: "online", price: 499, currency: "CZK", margin: 0.3, channels: [], tags: [],
    source: "manual", updatedAt: "old", sku: "S9", stock: 10, dailyVelocity: 1,
  };
  const events = diffCatalogEvents([base], [{ ...base, price: 599, stock: 2 }], "2026-08-10T00:00:00.000Z", "feed-import");
  await appendCatalogEvents(UID, PID, events);
  const rows = await listCatalogEvents(UID, PID, { key: "S9" });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.kind).sort(), ["price", "stock"]);
  assert.ok(rows.every((r) => r.actor === "feed-import"));
});

test("clearCatalogEvents: scrubs the project's whole ledger (the cascade seam)", async () => {
  await clearCatalogEvents(UID, PID);
  assert.equal((await listCatalogEvents(UID, PID)).length, 0);
  await clearCatalogEvents(UID, PID); // idempotent on an already-empty ledger
});
