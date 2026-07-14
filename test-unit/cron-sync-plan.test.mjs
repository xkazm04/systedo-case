/** Scheduled-sync account→project mapping (src/app/api/cron/sync/plan.ts).
 *  An Ads account is synced only into projects explicitly linked to it via
 *  project.adsCustomerId; a conservative fallback keeps pre-existing single
 *  users syncing without stranding them, and the old "every account into every
 *  project" fan-out is gone. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSyncTargets } from "@/app/api/cron/sync/plan";
import { buildSyncPairs } from "@/lib/cron/pairs";

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

// --- The shared fan-out spine (src/lib/cron/pairs.ts), adopted by the digest and
// report crons. buildSyncPairs hydrates each planSyncTargets decision back to the
// full account + project objects the email crons need (account.customerName for the
// subject, project branding), while inheriting the exact same cross-project
// isolation — the breach the two email crons previously had. ---

test("buildSyncPairs: linked pairs carry the full account + project objects", () => {
  const accA = { customerId: "111-111-1111", customerName: "Klient A", connectedAt: "x" };
  const accB = { customerId: "2222222222", customerName: "Klient B", connectedAt: "y" };
  const pA = { id: "pA", name: "Projekt A", type: "eshop", accentColor: "#111", adsCustomerId: "1111111111" };
  const pB = { id: "pB", name: "Projekt B", type: "leadgen", accentColor: "#222", adsCustomerId: "222-222-2222" };

  const pairs = buildSyncPairs({ userId: "u1", accounts: [accA, accB], projects: [pA, pB] });

  assert.equal(pairs.length, 2);
  // Each pair pins its own account + project object — no cross-wiring.
  assert.deepEqual(
    pairs.map((p) => ({ u: p.userId, acc: p.account.customerName, proj: p.project.id, r: p.target.reason })),
    [
      { u: "u1", acc: "Klient A", proj: "pA", r: "linked" },
      { u: "u1", acc: "Klient B", proj: "pB", r: "linked" },
    ]
  );
});

test("buildSyncPairs: an unlinked account produces NO pair (email isolation)", () => {
  // The digest/report adoption decision point: account B links to no project, so it
  // yields no pair — its data can never enter another project's email (the old
  // account×project cartesian would have paired B with pA).
  const pairs = buildSyncPairs({
    userId: "u1",
    accounts: [
      { customerId: "1111111111", customerName: "A", connectedAt: "x" },
      { customerId: "9999999999", customerName: "B", connectedAt: "y" },
    ],
    projects: [{ id: "pA", name: "A", type: "eshop", accentColor: "#111", adsCustomerId: "1111111111" }],
  });
  assert.deepEqual(
    pairs.map((p) => `${p.account?.customerId ?? "-"}→${p.project?.id ?? "-"}`),
    ["1111111111→pA"]
  );
});

test("buildSyncPairs: no connected accounts → per-project sample pairs, account null", () => {
  const pairs = buildSyncPairs({
    userId: "u1",
    accounts: [],
    projects: [
      { id: "p1", name: "One", type: "eshop", accentColor: "#111" },
      { id: "p2", name: "Two", type: "app", accentColor: "#222" },
    ],
  });
  assert.deepEqual(pairs.map((p) => p.project.id), ["p1", "p2"]);
  assert.ok(pairs.every((p) => p.account === null && p.target.customerId === null));
});

test("buildSyncPairs: single unmapped account + one project → the fallback pair, hydrated", () => {
  const pairs = buildSyncPairs({
    userId: "u1",
    accounts: [{ customerId: "1234567890", customerName: "Solo", connectedAt: "x" }],
    projects: [{ id: "solo", name: "Solo", type: "eshop", accentColor: "#111" }],
  });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].account.customerName, "Solo");
  assert.equal(pairs[0].project.id, "solo");
  assert.equal(pairs[0].target.reason, "single-project-fallback");
});
