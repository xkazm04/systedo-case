/** Direction 1 — the persisted inventory-plan store round-trip (the `inventory_plan`
 *  sqlite table, DDL in src/lib/db.ts) and the RMW helpers that keep the plan and the
 *  stock-alert episodes from clobbering each other. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-inventory-plan-test.db");
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

const { getInventoryPlanState, saveInventoryPlanState, clearInventoryPlanState, getStoredPlan, savePlan, getStockAlertState, saveStockAlertState } =
  await import("@/lib/inventory/plan-store");

test("save → get roundtrips the whole blob; clear reverts to null", async () => {
  const P = "proj-plan-a";
  assert.equal(await getInventoryPlanState(P), null);
  const state = {
    plan: { createdAt: "2026-07-14T00:00:00.000Z", inputsDigest: "abc", moves: [{ key: "A->B", fromSku: "A", toSku: "B", amountCzk: 500, state: "accepted" }] },
    stockAlerts: { A: { lastAlertAt: "2026-07-14T00:00:00.000Z", count: 1, active: true } },
    updatedAt: "2026-07-14T00:00:00.000Z",
  };
  await saveInventoryPlanState(P, state);
  const got = await getInventoryPlanState(P);
  assert.equal(got.plan.moves[0].state, "accepted");
  assert.equal(got.stockAlerts.A.count, 1);
  await clearInventoryPlanState(P);
  assert.equal(await getInventoryPlanState(P), null);
});

test("savePlan preserves stockAlerts; saveStockAlertState preserves the plan", async () => {
  const P = "proj-plan-b";
  // First write the alert state (as the sync path would).
  await saveStockAlertState(P, { SKU1: { lastAlertAt: "2026-07-14T00:00:00.000Z", count: 2, active: true } });
  assert.equal((await getStoredPlan(P)), null); // no plan yet

  // Then the user saves a plan — the alert state must survive.
  const plan = { createdAt: "2026-07-14T00:00:00.000Z", inputsDigest: "d1", moves: [{ key: "X->Y", fromSku: "X", toSku: "Y", amountCzk: 100, state: "proposed" }] };
  await savePlan(P, plan);
  assert.equal((await getStockAlertState(P)).SKU1.count, 2);
  assert.equal((await getStoredPlan(P)).inputsDigest, "d1");

  // And a new alert-state write must not wipe the saved plan.
  await saveStockAlertState(P, { SKU1: { lastAlertAt: "2026-07-14T01:00:00.000Z", count: 3, active: true } });
  assert.equal((await getStoredPlan(P)).moves[0].key, "X->Y");
  assert.equal((await getStockAlertState(P)).SKU1.count, 3);

  await clearInventoryPlanState(P);
});

test("getStockAlertState defaults to empty; getStoredPlan defaults to null", async () => {
  const P = "proj-plan-empty";
  assert.deepEqual(await getStockAlertState(P), {});
  assert.equal(await getStoredPlan(P), null);
});
