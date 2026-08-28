/** Bench regression (cron-scheduler-01): the sent-guard's claim must be MONOTONIC.
 *  `isNewPeriod` treats ANY different period as claimable, so claiming an OLDER
 *  (stale) period after a newer one was claimed succeeds, rewinds the stored period,
 *  and re-opens the already-sent current week for a double-send. The same predicate
 *  is re-implemented in SQL by the sqlite backend (`WHERE period <> excluded.period`).
 *  These tests fail until the claim is only granted for `period > previousPeriod`
 *  (ISO date strings sort lexicographically) in schedule.ts AND the sqlite backend. */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LOCAL_DB = "true";

const { isNewPeriod } = await import("@/lib/cron/schedule");
const { claimSentPeriod } = await import("@/lib/cron/sent-guard.local");

test("control: forward-moving claims keep working (first claim, same-period refusal, next week)", async () => {
  // Pure predicate — the semantics every backend mirrors.
  assert.equal(isNewPeriod(undefined, "2026-07-13"), true, "first-ever period is claimable");
  assert.equal(isNewPeriod("2026-07-13", "2026-07-13"), false, "same period is refused");
  assert.equal(isNewPeriod("2026-07-06", "2026-07-13"), true, "the next week is claimable");
  // sqlite backend.
  const tenant = "u_bench01ctl_proj_p1_0000000001";
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), true);
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), false);
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-20"), true);
});

test("isNewPeriod: a STALE (older) period is not claimable", () => {
  // The guard's contract: an already-sent window can't be re-sent. A stale period
  // arriving after a newer claim (clock skew across instances at the Monday
  // boundary, or any future caller passing a historical period) must be refused —
  // today `previousPeriod !== period` grants it.
  assert.equal(
    isNewPeriod("2026-07-20", "2026-07-13"),
    false,
    "claiming an older period after a newer one must be refused (monotonic guard)"
  );
});

test("sqlite claimSentPeriod: a stale claim is refused and cannot re-open the current week", async () => {
  const tenant = "u_bench01sql_proj_p2_0000000002";
  const kind = "digest-weekly";
  // Current week claimed → sent.
  assert.equal(await claimSentPeriod(tenant, kind, "2026-07-20"), true);
  // A stale (previous-week) claim must be refused — today the UPSERT's
  // `period <> excluded.period` grants it and rewinds the stored period.
  assert.equal(
    await claimSentPeriod(tenant, kind, "2026-07-13"),
    false,
    "sqlite backend must refuse a stale-period claim"
  );
  // …and the current week must still be guarded (no re-send of an already-sent week).
  assert.equal(
    await claimSentPeriod(tenant, kind, "2026-07-20"),
    false,
    "the already-sent current week must remain claimed after a stale-claim attempt"
  );
});
