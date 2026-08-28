/** Per-user failure isolation in the cron fan-out spine (src/lib/cron/fan-out.ts).
 *  The spine's contract is "one bad tenant never aborts the rest" — that has to
 *  hold for the per-user store LOAD too, not just for `run(pair)`. An unguarded
 *  load rejection used to propagate out of forEachSyncPair, so every remaining
 *  user was skipped, the cron's recordCronRun never ran and the route 500'd with
 *  no run record at all. Stores are injected, so this needs no Firestore. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { forEachSyncPair } from "@/lib/cron/fan-out";

const okStores = (userIds) => ({
  listConnectedUserIds: async () => userIds,
  listConnectedAccounts: async () => ({ accounts: [{ customerId: "1111111111" }] }),
  listProjects: async (userId) => [{ id: `p_${userId}`, adsCustomerId: "1111111111" }],
});

test("a user's accounts-load failure is reported, and the later users still run", async () => {
  const ran = [];
  const failed = [];
  const counts = await forEachSyncPair(
    async (pair) => ran.push(`${pair.userId}/${pair.target.projectId}`),
    (pair, err) => failed.push({ userId: pair.userId, message: String(err) }),
    {
      ...okStores(["u1", "u2", "u3"]),
      listConnectedAccounts: async (userId) => {
        if (userId === "u2") throw new Error("firestore unavailable");
        return { accounts: [{ customerId: "1111111111" }] };
      },
    }
  );

  // u2's failure did not swallow u3.
  assert.deepEqual(ran, ["u1/p_u1", "u3/p_u3"]);
  assert.deepEqual(
    failed.map((f) => f.userId),
    ["u2"]
  );
  assert.match(failed[0].message, /firestore unavailable/);
  assert.deepEqual(counts, { users: 3, pairs: 2 });
});

test("a projects-load failure is isolated the same way", async () => {
  const failed = [];
  let ran = 0;
  await forEachSyncPair(
    async () => void ran++,
    (pair) => failed.push(pair.userId),
    {
      ...okStores(["a", "b"]),
      listProjects: async (userId) => {
        if (userId === "a") throw new Error("boom");
        return [{ id: "p_b", adsCustomerId: "1111111111" }];
      },
    }
  );

  assert.deepEqual(failed, ["a"]);
  assert.equal(ran, 1);
});

test("the synthetic error pair carries the user and no account/project", async () => {
  const seen = [];
  await forEachSyncPair(
    async () => {},
    (pair, err) => seen.push({ pair, err }),
    { ...okStores(["solo"]), listProjects: async () => { throw new Error("down"); } }
  );

  assert.equal(seen.length, 1);
  const { pair } = seen[0];
  // The crons read pair.target for their result row — it must be present and empty,
  // so the row is `{ userId, ok: false }` rather than a crash inside onError.
  assert.equal(pair.userId, "solo");
  assert.equal(pair.target.customerId, null);
  assert.equal(pair.target.projectId, undefined);
  assert.equal(pair.account, null);
  assert.equal(pair.project, null);
});

test("a run(pair) failure is still isolated per pair (unchanged)", async () => {
  const failed = [];
  const counts = await forEachSyncPair(
    async (pair) => {
      if (pair.userId === "x") throw new Error("send failed");
    },
    (pair, err) => failed.push(`${pair.userId}:${String(err)}`),
    okStores(["x", "y"])
  );

  assert.equal(failed.length, 1);
  assert.match(failed[0], /^x:.*send failed/);
  assert.deepEqual(counts, { users: 2, pairs: 2 });
});
