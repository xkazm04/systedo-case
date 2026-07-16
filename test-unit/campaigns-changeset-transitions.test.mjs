/** Direction 1 — the envelope actually closes (control-plane-types.ts). Pure
 *  state-transition policy for the change-set lifecycle: the honest terminal
 *  status of a finished apply, the staleness clock on a transient claim, and the
 *  claim/recover/refuse decisions for approve + revert. No firebase — the live
 *  loop is I/O in control-plane.ts; here we prove the decisions it acts on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isStaleClaim,
  settledApplyStatus,
  settledRevertStatus,
  hasRestoreSnapshots,
  planApproveClaim,
  planRevertClaim,
  forwardProjectionApplies,
  CLAIM_TTL_MS,
} from "@/lib/campaigns/control-plane-types";

const ok = (n) => ({ fromName: "a", toName: "b", ok: true });
const fail = (n) => ({ fromName: "a", toName: "b", ok: false, error: "no live account" });

// --- settledApplyStatus: all-moves-failed lands "failed", not "applied" ------

test("every move failing settles the set to a terminal 'failed'", () => {
  assert.equal(settledApplyStatus([fail(), fail()]), "failed");
});

test("any move landing settles the set to 'applied'", () => {
  assert.equal(settledApplyStatus([fail(), ok()]), "applied");
  assert.equal(settledApplyStatus([ok(), ok()]), "applied");
});

test("an empty result list settles 'applied' (never happens — a set has >=1 move)", () => {
  assert.equal(settledApplyStatus([]), "applied");
});

// --- settledRevertStatus: a failed restore must NOT settle "reverted" --------

test("a fully-landed restore settles 'reverted'", () => {
  assert.equal(settledRevertStatus(true, true), "reverted");
});

test("any restore failure keeps the set 'applied' so the (idempotent) revert can be retried", () => {
  assert.equal(settledRevertStatus(false, true), "applied");
  assert.equal(settledRevertStatus(true, false), "applied");
  assert.equal(settledRevertStatus(false, false), "applied");
});

// --- isStaleClaim: a transient claim ages out at the TTL ---------------------

test("a missing or unparseable claim stamp is treated as stale (recoverable)", () => {
  assert.equal(isStaleClaim(undefined, Date.now()), true);
  assert.equal(isStaleClaim("not-a-date", Date.now()), true);
});

test("a fresh claim is not stale; one past the TTL is", () => {
  const now = 10 * CLAIM_TTL_MS;
  const fresh = new Date(now - 1000).toISOString();
  const old = new Date(now - CLAIM_TTL_MS - 1000).toISOString();
  assert.equal(isStaleClaim(fresh, now), false);
  assert.equal(isStaleClaim(old, now), true);
  // exactly at the boundary counts as stale
  assert.equal(isStaleClaim(new Date(now - CLAIM_TTL_MS).toISOString(), now), true);
});

// --- hasRestoreSnapshots -----------------------------------------------------

test("hasRestoreSnapshots is true iff a budget or status snapshot exists", () => {
  assert.equal(hasRestoreSnapshots({}), false);
  assert.equal(hasRestoreSnapshots({ budgetSnapshots: [], statusSnapshots: [] }), false);
  assert.equal(hasRestoreSnapshots({ budgetSnapshots: [{ budgetResourceName: "x", prevMicros: 1 }] }), true);
  assert.equal(hasRestoreSnapshots({ statusSnapshots: [{ campaignId: "c", campaignName: "C", prevStatus: "enabled" }] }), true);
});

// --- planApproveClaim --------------------------------------------------------

test("approve claims a pending set and no-ops any settled state", () => {
  const now = 10 * CLAIM_TTL_MS;
  assert.deepEqual(planApproveClaim({ status: "pending" }, now), { kind: "proceed" });
  assert.deepEqual(planApproveClaim({ status: "applied" }, now), { kind: "noop" });
  assert.deepEqual(planApproveClaim({ status: "reverted" }, now), { kind: "noop" });
  assert.deepEqual(planApproveClaim({ status: "failed" }, now), { kind: "noop" });
});

test("approve leaves a fresh 'applying' claim alone but recovers a stranded one to 'failed'", () => {
  const now = 10 * CLAIM_TTL_MS;
  const fresh = new Date(now - 1000).toISOString();
  const old = new Date(now - CLAIM_TTL_MS - 1000).toISOString();
  assert.deepEqual(planApproveClaim({ status: "applying", claimedAt: fresh }, now), { kind: "noop" });
  assert.deepEqual(planApproveClaim({ status: "applying", claimedAt: old }, now), { kind: "recover", status: "failed" });
  // a legacy transient with no stamp is recoverable
  assert.deepEqual(planApproveClaim({ status: "applying" }, now), { kind: "recover", status: "failed" });
});

// --- planRevertClaim ---------------------------------------------------------

test("revert proceeds only for an applied set that carries snapshots", () => {
  const now = 10 * CLAIM_TTL_MS;
  const snaps = { budgetSnapshots: [{ budgetResourceName: "x", prevMicros: 1 }] };
  assert.deepEqual(planRevertClaim({ status: "applied", ...snaps }, now), { kind: "proceed" });
});

test("revert REFUSES an applied set with no snapshots (never legacy-inverse a failed apply)", () => {
  const now = 10 * CLAIM_TTL_MS;
  assert.deepEqual(planRevertClaim({ status: "applied" }, now), { kind: "refuse" });
  assert.deepEqual(planRevertClaim({ status: "applied", budgetSnapshots: [], statusSnapshots: [] }, now), { kind: "refuse" });
});

test("revert re-claims a stranded 'reverting' set (idempotent absolute restore) but not a fresh one", () => {
  const now = 10 * CLAIM_TTL_MS;
  const fresh = new Date(now - 1000).toISOString();
  const old = new Date(now - CLAIM_TTL_MS - 1000).toISOString();
  assert.deepEqual(planRevertClaim({ status: "reverting", claimedAt: fresh }, now), { kind: "noop" });
  assert.deepEqual(planRevertClaim({ status: "reverting", claimedAt: old }, now), { kind: "reclaim" });
});

test("revert no-ops pending/failed/reverted sets", () => {
  const now = 10 * CLAIM_TTL_MS;
  assert.deepEqual(planRevertClaim({ status: "pending" }, now), { kind: "noop" });
  assert.deepEqual(planRevertClaim({ status: "failed" }, now), { kind: "noop" });
  assert.deepEqual(planRevertClaim({ status: "reverted" }, now), { kind: "noop" });
});

// --- forwardProjectionApplies: a failed set is settled, not projecting -------

test("forwardProjectionApplies is false for the terminal 'failed' status", () => {
  assert.equal(forwardProjectionApplies("failed"), false);
});
