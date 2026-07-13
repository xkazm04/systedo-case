/** Scheduled-sync account→project mapping (src/app/api/cron/sync/plan.ts).
 *  An Ads account is synced only into projects explicitly linked to it via
 *  project.adsCustomerId; a conservative fallback keeps pre-existing single
 *  users syncing without stranding them, and the old "every account into every
 *  project" fan-out is gone. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSyncTargets } from "@/app/api/cron/sync/plan";

test("linked accounts sync ONLY into the project that links to them", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "111-111-1111" }, { customerId: "2222222222" }],
    projects: [
      { id: "pA", type: "eshop", adsCustomerId: "1111111111" },
      { id: "pB", type: "leadgen", adsCustomerId: "222-222-2222" },
    ],
  });
  // Digits-normalised match, each account → its own project, no cross-writes.
  assert.deepEqual(
    targets.map((t) => ({ c: t.customerId, p: t.projectId, r: t.reason })),
    [
      { c: "111-111-1111", p: "pA", r: "linked" },
      { c: "2222222222", p: "pB", r: "linked" },
    ]
  );
});

test("an unmapped account in a multi-project workspace writes nowhere (isolation)", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "1111111111" }, { customerId: "9999999999" }],
    projects: [
      { id: "pA", adsCustomerId: "1111111111" },
      { id: "pB", adsCustomerId: "2222222222" },
    ],
  });
  // Only the linked pair — account 9999999999 matches no project and is skipped,
  // instead of being mirrored into every project (the old N×M bug).
  assert.deepEqual(
    targets.map((t) => `${t.customerId}->${t.projectId}`),
    ["1111111111->pA"]
  );
});

test("classic single-account + single-project user with NO link is preserved", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "1234567890" }],
    projects: [{ id: "solo", type: "eshop" }],
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0].customerId, "1234567890");
  assert.equal(targets[0].projectId, "solo");
  assert.equal(targets[0].reason, "single-project-fallback");
});

test("single unmapped account, no projects → per-user tenant (existing fallback)", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "1234567890" }],
    projects: [],
  });
  assert.deepEqual(targets, [
    { customerId: "1234567890", projectId: undefined, projectType: undefined, reason: "no-project-fallback" },
  ]);
});

test("no fallback double-write: single-project fallback never fires with 2 accounts", () => {
  // Two accounts, one project (unmapped): an agency must map. Neither account is
  // mirrored into the lone project (that would overwrite one with the other).
  const targets = planSyncTargets({
    accounts: [{ customerId: "1111111111" }, { customerId: "2222222222" }],
    projects: [{ id: "pA" }],
  });
  assert.deepEqual(targets, []);
});

test("no connected accounts → null-account (sample) sync per project, as before", () => {
  assert.deepEqual(planSyncTargets({ accounts: [], projects: [] }), [
    { customerId: null, reason: "no-project-fallback" },
  ]);
  const perProject = planSyncTargets({
    accounts: [],
    projects: [{ id: "p1", type: "eshop" }, { id: "p2", type: "app" }],
  });
  assert.deepEqual(perProject.map((t) => t.projectId), ["p1", "p2"]);
  assert.ok(perProject.every((t) => t.customerId === null));
});

test("a project linked to a not-connected account gets no live sync", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "1111111111" }],
    projects: [
      { id: "pA", adsCustomerId: "1111111111" },
      { id: "pGhost", adsCustomerId: "5555555555" },
    ],
  });
  assert.deepEqual(targets.map((t) => t.projectId), ["pA"]);
});
