/** Bench regression (cron-scheduler-02): one user's store-load failure must not
 *  abort the whole cron fan-out. forEachSyncPair's try/catch only wraps `run(pair)`;
 *  the per-user `Promise.all([listConnectedAccounts, listProjects])` is unguarded,
 *  so a single user's Firestore read rejection propagates out of forEachSyncPair —
 *  every remaining user is skipped and the calling cron 500s with no run record,
 *  contradicting the module's own contract ("one bad tenant never aborts the rest").
 *  This test fails until the per-user store loads are isolated like the per-pair
 *  work is.
 *
 *  Run with --experimental-test-module-mocks (the store reads are mocked). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const account = { customerId: "1234567890", customerName: "Acme Ads", connectedAt: "2026-01-01T00:00:00.000Z" };
const projectFor = (id) => ({
  id,
  name: `Project ${id}`,
  type: "eshop",
  accentColor: "#fff",
  adsCustomerId: "1234567890",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/** When true, u-broken's account-store read rejects (the defect's trigger). */
let brokenStoreRead = false;

mock.module("@/lib/campaigns/connection", {
  namedExports: {
    listConnectedUserIds: async () => ["u-broken", "u-healthy"],
    listConnectedAccounts: async (userId) => {
      if (brokenStoreRead && userId === "u-broken") {
        throw new Error("simulated Firestore read failure for u-broken");
      }
      return { accounts: [account] };
    },
  },
});
mock.module("@/lib/projects/store", {
  namedExports: {
    listProjects: async (userId) => [projectFor(userId === "u-broken" ? "p-broken" : "p-ok")],
  },
});
mock.module("@/lib/campaigns/connector", {
  namedExports: {
    resolveTenant: async (userId, projectId) => `u_${userId}_proj_${projectId ?? "none"}`,
    resolveTenantForAccount: async (userId, projectId, customerId) =>
      `u_${userId}_proj_${projectId ?? "none"}_${customerId}`,
  },
});

const { forEachSyncPair } = await import("@/lib/cron/fan-out");

test("control: with healthy stores, both users fan out and a run() failure is isolated per pair", async () => {
  brokenStoreRead = false;
  const ran = [];
  const errors = [];
  const result = await forEachSyncPair(
    async (pair) => {
      ran.push(pair.userId);
      if (pair.userId === "u-broken") throw new Error("per-pair failure");
    },
    (pair, err) => errors.push({ userId: pair.userId, message: String(err) })
  );
  assert.equal(result.users, 2);
  assert.ok(ran.includes("u-healthy"), "healthy user's pair ran");
  assert.equal(errors.length, 1, "the pair-level failure was routed to onError");
  assert.equal(errors[0].userId, "u-broken");
});

test("one user's store-load failure is isolated: remaining users still fan out", async () => {
  brokenStoreRead = true;
  const ran = [];
  const errors = [];
  let result;
  try {
    result = await forEachSyncPair(
      async (pair) => {
        ran.push(pair.userId);
      },
      (pair, err) => errors.push({ userId: pair?.userId ?? null, message: String(err) })
    );
  } catch (err) {
    assert.fail(
      `forEachSyncPair rejected instead of isolating the bad tenant — every remaining user was skipped and the cron would 500 with no run record: ${err}`
    );
  }
  assert.ok(
    ran.includes("u-healthy"),
    "the healthy user's linked pair must still be processed after another user's store read failed"
  );
  assert.ok(errors.length >= 1, "the broken user's failure is routed to onError, not thrown");
  assert.ok(result, "the fan-out returns its user/pair summary despite the bad tenant");
});
