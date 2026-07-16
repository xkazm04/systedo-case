/** Direction 2 — double-run guard decisions (pure parts) + the local sent-guard
 *  claim store. Covers:
 *   - isoWeekKey / isNewPeriod (the digest weekly guard's pure decision),
 *   - isDayClaimed (the report claim-first decision),
 *   - the sqlite claimSentPeriod UPSERT-where: first claim wins, a re-fire in the
 *     same period is refused, a new period re-claims (the double-send fix). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

// Throwaway db BEFORE the store lazily opens it (mirrors report-metrics.test.mjs).
const dbFile = join(tmpdir(), "systedo-cron-guards-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { isoWeekKey, isNewPeriod } = await import("@/lib/cron/schedule");
// isDayClaimed lives in report-config.ts. It's a pure sync fn; the module only
// touches Firestore lazily at call time (init is lazy in dev), so importing it to
// exercise the pure decision is safe here.
const { isDayClaimed: isDayClaimedReal } = await import("@/lib/campaigns/report-config");

test("isoWeekKey: every day in the same ISO week maps to that week's Monday (UTC)", () => {
  // 2026-07-13 is a Monday. Mon…Sun of that week all key to 2026-07-13.
  const monday = new Date("2026-07-13T07:00:00Z");
  const sameWeek = [
    "2026-07-13T00:00:00Z", // Mon
    "2026-07-15T12:00:00Z", // Wed
    "2026-07-19T23:59:59Z", // Sun
  ].map((d) => isoWeekKey(new Date(d)));
  assert.deepEqual(sameWeek, ["2026-07-13", "2026-07-13", "2026-07-13"]);
  assert.equal(isoWeekKey(monday), "2026-07-13");
  // The next Monday starts a new week key.
  assert.equal(isoWeekKey(new Date("2026-07-20T07:00:00Z")), "2026-07-20");
  // A Sunday just before belongs to the PRIOR week's Monday.
  assert.equal(isoWeekKey(new Date("2026-07-12T23:00:00Z")), "2026-07-06");
});

test("isNewPeriod: only a changed period is claimable", () => {
  assert.equal(isNewPeriod(undefined, "2026-07-13"), true);
  assert.equal(isNewPeriod(null, "2026-07-13"), true);
  assert.equal(isNewPeriod("2026-07-06", "2026-07-13"), true);
  assert.equal(isNewPeriod("2026-07-13", "2026-07-13"), false);
});

test("isDayClaimed: the report claim-first compare-and-set decision", () => {
  assert.equal(isDayClaimedReal(undefined, "2026-07-14"), false);
  assert.equal(isDayClaimedReal("2026-07-13", "2026-07-14"), false);
  assert.equal(isDayClaimedReal("2026-07-14", "2026-07-14"), true);
});

test("local claimSentPeriod: first claim wins, same-period re-fire refused, new period re-claims", async () => {
  const { claimSentPeriod } = await import("@/lib/cron/sent-guard.local");
  const tenant = "u_guardtest_proj_p1_1234567890";

  // First run this week claims → true (proceed to send).
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), true);
  // A manual re-fire in the SAME week is refused → false (skip: no double-send).
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), false);
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), false);
  // The NEXT week is a new period → claimable again.
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-20"), true);
  // …and now that new week is itself guarded.
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-20"), false);

  // A different tenant is independent (per-tenant guard).
  const other = "u_guardtest_proj_p2_9999999999";
  assert.equal(await claimSentPeriod(other, "digest-weekly", "2026-07-13"), true);
});

test("local releaseSentPeriod: a released claim is retryable, a moved-on period is untouched", async () => {
  const { claimSentPeriod, releaseSentPeriod } = await import("@/lib/cron/sent-guard.local");
  const tenant = "u_guardtest_proj_p3_5555555555";

  // Claim → total failure → release → the SAME period is claimable again
  // (the digest retries the lost week instead of silently consuming it).
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), true);
  await releaseSentPeriod(tenant, "digest-weekly", "2026-07-13");
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), true);
  // …and the re-claim is guarded again.
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-13"), false);

  // Releasing a STALE period is a no-op: the current claim stands.
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-20"), true);
  await releaseSentPeriod(tenant, "digest-weekly", "2026-07-13");
  assert.equal(await claimSentPeriod(tenant, "digest-weekly", "2026-07-20"), false);
});
