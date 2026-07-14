/** Direction 1 — the connection badge tells the truth. Covers the pure derivation of
 *  the badge from a real StoredConnection (connected / failing / never-synced), the
 *  honestly-labeled demo badge, and that the connector picker + provider metadata derive
 *  from the ONE registry (SYNC_PROVIDERS) rather than a second, drift-prone list. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveWarehouseBadge,
  demoWarehouseConnection,
  warehouseConnectionFor,
  warehouseProvider,
} from "@/lib/inventory/warehouse";
import { SYNC_PROVIDERS, warehouseDisplayProviders } from "@/lib/inventory/providers";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();

test("deriveWarehouseBadge: a synced connection is healthy with a real sync age", () => {
  const badge = deriveWarehouseBadge(
    { provider: "baselinker", connectedAt: ago(1000), lastSyncAt: ago(30) },
    NOW
  );
  assert.equal(badge.health, "ok");
  assert.equal(badge.syncedMinsAgo, 30);
  assert.equal(badge.syncedAt, ago(30));
  assert.equal(badge.demo, false);
  assert.equal(badge.provider.label, "Baselinker");
  assert.equal(badge.lastError, undefined);
});

test("deriveWarehouseBadge: a failing connection reads failing but keeps the last good sync", () => {
  const badge = deriveWarehouseBadge(
    { provider: "baselinker", connectedAt: ago(1000), lastSyncAt: ago(120), lastError: "Baselinker vrátil chybu (429).", failCount: 3 },
    NOW
  );
  assert.equal(badge.health, "failing");
  assert.equal(badge.lastError, "Baselinker vrátil chybu (429).");
  assert.equal(badge.failCount, 3);
  assert.equal(badge.syncedMinsAgo, 120); // still surfaces the last successful sync
  assert.equal(badge.demo, false);
});

test("deriveWarehouseBadge: a connection that never synced is 'never-synced' with null age", () => {
  const badge = deriveWarehouseBadge({ provider: "baselinker", connectedAt: ago(5) }, NOW);
  assert.equal(badge.health, "never-synced");
  assert.equal(badge.syncedMinsAgo, null);
  assert.equal(badge.syncedAt, null);
});

test("deriveWarehouseBadge: an error with zero failCount is not yet 'failing'", () => {
  // failCount must be > 0 for the failing state (a cleared error leaves lastError unset).
  const badge = deriveWarehouseBadge(
    { provider: "baselinker", connectedAt: ago(100), lastSyncAt: ago(10), lastError: undefined, failCount: 0 },
    NOW
  );
  assert.equal(badge.health, "ok");
});

test("deriveWarehouseBadge: null connection → no badge (the picker shows instead)", () => {
  assert.equal(deriveWarehouseBadge(null, NOW), null);
});

test("deriveWarehouseBadge: an unknown provider still yields an honest badge (no crash)", () => {
  const badge = deriveWarehouseBadge({ provider: "some-future-erp", connectedAt: ago(10), lastSyncAt: ago(2) }, NOW);
  assert.equal(badge.provider.id, "some-future-erp");
  assert.equal(badge.health, "ok");
});

test("demo badge is illustrative and honestly flagged (demo: true)", () => {
  const badge = demoWarehouseConnection(NOW);
  assert.equal(badge.demo, true);
  assert.equal(badge.health, "ok");
  assert.equal(badge.provider.id, "baselinker");
  assert.equal(badge.syncedMinsAgo, 6);
  // demo-* projects get the demo badge; real projects derive from the store (null here).
  assert.equal(warehouseConnectionFor("demo-eshop", NOW).demo, true);
  assert.equal(warehouseConnectionFor("real-project", NOW), null);
});

test("ONE registry: the picker list derives from SYNC_PROVIDERS' branded entries", () => {
  const branded = SYNC_PROVIDERS.filter((p) => p.kind).map((p) => p.id);
  const display = warehouseDisplayProviders().map((p) => p.id);
  assert.deepEqual(display, branded); // same source, same order
  assert.deepEqual(display, ["baselinker", "shipmonk", "skladon", "pohoda", "money-s3", "helios"]);
  // the demo + generic-ERP adapters are NOT connectable-branded, so not in the picker
  assert.equal(display.includes("demo"), false);
  assert.equal(display.includes("erp"), false);
});

test("warehouseProvider derives display metadata from the registry", () => {
  const bl = warehouseProvider("baselinker");
  assert.equal(bl.label, "Baselinker");
  assert.equal(bl.kind, "hub");
  assert.equal(bl.mark, "BL");
  assert.ok(bl.blurb.length > 0);
  assert.equal(warehouseProvider("does-not-exist"), undefined);
});
