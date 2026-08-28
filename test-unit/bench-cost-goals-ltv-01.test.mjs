/** Bench regression (cost-goals-ltv-01): recordProjectGoal must never overwrite the
 *  headline `goal` ("the monthly revenue goal in force NOW") with a value that is
 *  not in force for the current month. The API accepts ANY well-formed YYYY-MM
 *  effectiveMonth, so correcting a PAST month or recording a planned FUTURE raise
 *  must keep the headline at the goal actually in force today (resolve it via
 *  goalForMonth over the appended history). Uses the sqlite twin like
 *  goals-store.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-bench-goals-headline.db");
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

const { recordProjectGoal, getProjectGoal } = await import("@/lib/goals/store");

test("correcting a PAST month must not rewrite the headline goal in force now", async () => {
  // Goal 500k has been in force since 2026-05 (the past, relative to today).
  await recordProjectGoal("bench-past", "2026-05", 500000);
  // Back-fill a correction for January — a PAST month before the 500k era.
  const next = await recordProjectGoal("bench-past", "2026-01", 100000);
  assert.equal(next.history.length, 2, "the correction lands in the history log");
  assert.equal(
    next.goal,
    500000,
    "headline goal must stay the goal in force for the CURRENT month, not the past month's correction"
  );
  const stored = await getProjectGoal("bench-past");
  assert.equal(stored.goal, 500000, "the persisted blob's headline agrees");
});

test("recording a planned FUTURE raise must not judge this month against it", async () => {
  await recordProjectGoal("bench-future", "2026-05", 500000);
  // A raise planned for 2099 — not yet in force.
  const next = await recordProjectGoal("bench-future", "2099-01", 999000);
  assert.equal(next.history.length, 2, "the future raise lands in the history log");
  assert.equal(
    next.goal,
    500000,
    "headline goal must stay the goal in force NOW, not a future month's planned raise"
  );
  const stored = await getProjectGoal("bench-future");
  assert.equal(stored.goal, 500000, "the persisted blob's headline agrees");
});
