/** Unit tests for planAlertAction: the whitelist that stops unknown/typo'd/absent
 *  alert actions from falling through to the destructive bulk "mark all read". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planAlertAction } from "@/lib/campaigns/alert-actions";

test("planAlertAction: acknowledge requires an id", () => {
  assert.deepEqual(planAlertAction({ action: "acknowledge", id: "a1" }), {
    kind: "acknowledge",
    id: "a1",
  });
  const missing = planAlertAction({ action: "acknowledge" });
  assert.equal("error" in missing && missing.status, 422);
});

test("planAlertAction: read marks one alert (requires id)", () => {
  assert.deepEqual(planAlertAction({ action: "read", id: "a2" }), { kind: "read", id: "a2" });
  const missing = planAlertAction({ action: "read", id: "" });
  assert.equal("error" in missing && missing.status, 422);
});

test("planAlertAction: readAll is the only path to the bulk mark-all", () => {
  assert.deepEqual(planAlertAction({ action: "readAll" }), { kind: "readAll" });
});

test("planAlertAction: unknown / typo'd action is rejected 400, not defaulted", () => {
  for (const action of ["acknowlege", "delete", "nuke", 42, null]) {
    const plan = planAlertAction({ action, id: "a1" });
    assert.ok("error" in plan, `expected reject for ${String(action)}`);
    assert.equal(plan.status, 400);
  }
});

test("planAlertAction: absent action (unreadable/empty body) is rejected 400", () => {
  const plan = planAlertAction({});
  assert.ok("error" in plan);
  assert.equal(plan.status, 400);
  // Critically: an id with no action must NOT become a bulk mark-all.
  const idOnly = planAlertAction({ id: "a1" });
  assert.ok("error" in idOnly);
  assert.equal(idOnly.status, 400);
});
