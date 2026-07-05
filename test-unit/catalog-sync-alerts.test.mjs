/** Unit tests for scheduled-sync failure alerting: the pure transition classifier
 *  (alert once on healthy→failing, again on recovery) and the connection store
 *  round-tripping + clearing the sync-health fields. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySyncResult } from "@/lib/inventory/sync-health";
import {
  deleteConnection,
  getConnection,
  saveConnection,
} from "@/lib/inventory/connection-store.local.ts";

test("classifySyncResult: alert once on the healthy→failing transition, and on recovery", () => {
  // healthy → fail: newly failed, count 1
  assert.deepEqual(classifySyncResult({}, false), { recovered: false, newlyFailed: true, nextFailCount: 1 });
  // failing → fail again: NOT newly failed (no nightly re-alert), count bumps
  assert.deepEqual(classifySyncResult({ lastError: "x", failCount: 1 }, false), {
    recovered: false,
    newlyFailed: false,
    nextFailCount: 2,
  });
  // failing → ok: recovered, count resets
  assert.deepEqual(classifySyncResult({ lastError: "x", failCount: 3 }, true), {
    recovered: true,
    newlyFailed: false,
    nextFailCount: 0,
  });
  // healthy → ok: nothing to say
  assert.deepEqual(classifySyncResult({}, true), { recovered: false, newlyFailed: false, nextFailCount: 0 });
});

test("connection store round-trips sync-health fields, then clears them on success", async () => {
  const uid = "health-test-user";
  const pid = "health-test-proj";
  await saveConnection(uid, pid, {
    provider: "erp-demo",
    connectedAt: "2026-07-05T00:00:00.000Z",
    lastError: "Odpověď ERP není platný JSON.",
    lastErrorAt: "2026-07-05T05:00:00.000Z",
    failCount: 2,
  });
  const failed = await getConnection(uid, pid);
  assert.ok(failed);
  assert.equal(failed.lastError, "Odpověď ERP není platný JSON.");
  assert.equal(failed.failCount, 2);
  assert.equal(failed.lastSyncAt, undefined); // a failure never stamps lastSyncAt

  // a successful sync clears the error, resets failCount, stamps lastSyncAt
  await saveConnection(uid, pid, {
    ...failed,
    lastSyncAt: "2026-07-05T06:00:00.000Z",
    lastError: undefined,
    lastErrorAt: undefined,
    failCount: 0,
  });
  const healthy = await getConnection(uid, pid);
  assert.equal(healthy.lastError, undefined);
  assert.equal(healthy.lastErrorAt, undefined);
  assert.equal(healthy.failCount, 0);
  assert.equal(healthy.lastSyncAt, "2026-07-05T06:00:00.000Z");

  await deleteConnection(uid, pid);
});
