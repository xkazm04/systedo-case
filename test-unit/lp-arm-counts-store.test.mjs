/** WP W3-B — the hosted LP experiment's counter store, against a REAL sqlite file
 *  (the store's own behaviour is the point: upsert-increment, day rows, the retention
 *  prune and the cascade clear).
 *
 *  The increment half matters more than it looks: a public landing page is the most
 *  concurrent write path in the product, and a read-modify-write here would silently
 *  lose views under any real traffic — which would show up not as an error but as a
 *  conversion rate that is quietly too high. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-lp-counts-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { bumpLpCount, listLpCountDays, listLpCountProjects, pruneLpCounts, clearLpCounts } =
  await import("@/lib/lp-exp/counts-store");
const { foldArmTotals, lpUtcDay, lpRetentionCutoff, LP_COUNT_RETENTION_DAYS } = await import(
  "@/lib/lp-exp/counts"
);

const TODAY = lpUtcDay(new Date());
const P1 = "p-alpha";
const P2 = "p-beta";

test("both counters increment the SAME (experiment, arm, day) row", async () => {
  await bumpLpCount("e1", "x1", TODAY, "views", P1);
  await bumpLpCount("e1", "x1", TODAY, "views", P1);
  await bumpLpCount("e1", "x1", TODAY, "views", P1);
  await bumpLpCount("e1", "x1", TODAY, "conversions", P1);

  const rows = await listLpCountDays("e1", TODAY);
  assert.equal(rows.length, 1, "one row per (experiment, arm, day) — not one per hit");
  assert.deepEqual(rows[0], {
    experimentId: "e1",
    armId: "x1",
    day: TODAY,
    views: 3,
    conversions: 1,
  });
});

test("arms and days are separate rows, returned in deterministic order", async () => {
  await bumpLpCount("e1", "x2", TODAY, "views", P1);
  await bumpLpCount("e1", "x2", "2026-01-02", "views", P1);
  await bumpLpCount("e1", "x1", "2026-01-02", "conversions", P1);

  const rows = await listLpCountDays("e1", "2026-01-01");
  assert.deepEqual(
    rows.map((r) => `${r.day}/${r.armId}`),
    ["2026-01-02/x1", "2026-01-02/x2", `${TODAY}/x1`, `${TODAY}/x2`],
    "ordered by (day, armId) — a pinned test and a rendered table must agree"
  );
});

test("listLpCountDays is windowed and scoped to ONE experiment", async () => {
  await bumpLpCount("e2", "y1", TODAY, "views", P2);
  assert.deepEqual(
    (await listLpCountDays("e1", TODAY)).map((r) => r.armId).sort(),
    ["x1", "x2"],
    "another experiment's rows are not visible"
  );
  assert.equal((await listLpCountDays("e1", "2999-01-01")).length, 0, "the window is respected");
  assert.equal((await listLpCountDays("", TODAY)).length, 0, "an empty key asks nothing");
});

test("foldArmTotals sums a window into the per-arm numbers the sync step writes", async () => {
  const totals = foldArmTotals(await listLpCountDays("e1", "2026-01-01"));
  assert.deepEqual(totals.get("x1"), { views: 3, conversions: 2 });
  assert.deepEqual(totals.get("x2"), { views: 2, conversions: 0 });
  // Hostile rows fold to zero rather than subtracting from a real total.
  const junk = foldArmTotals([
    { experimentId: "e", armId: "z", day: "d", views: -5, conversions: Number.NaN },
    { experimentId: "e", armId: "", day: "d", views: 9, conversions: 9 },
  ]);
  assert.deepEqual(junk.get("z"), { views: 0, conversions: 0 });
  assert.equal(junk.has(""), false, "a row with no arm identity is not an arm");
});

test("the work list is the DISTINCT set of projects that actually have counters", async () => {
  const projects = await listLpCountProjects();
  assert.deepEqual(projects, [P1, P2].sort(), "de-duplicated and deterministically ordered");
  assert.equal((await listLpCountProjects(1)).length, 1, "bounded — one tick cannot run forever");
});

test("the retention cut is the documented window, and the prune removes only what is past it", async () => {
  const now = new Date("2026-08-30T00:00:00.000Z");
  assert.equal(lpRetentionCutoff(now), "2026-03-03");
  assert.equal(LP_COUNT_RETENTION_DAYS, 180);

  const pruned = await pruneLpCounts("2026-01-03"); // the 2026-01-02 rows, nothing else
  assert.equal(pruned, 2);
  assert.deepEqual(
    (await listLpCountDays("e1", "2026-01-01")).map((r) => r.day),
    [TODAY, TODAY],
    "today's rows survived"
  );
  assert.equal(await pruneLpCounts("2026-01-03"), 0, "pruning twice is a no-op (idempotent)");
});

test("the cascade clear drops one project's rows and leaves every other project's alone", async () => {
  await clearLpCounts(P1);
  assert.equal((await listLpCountDays("e1", "2000-01-01")).length, 0, "P1's counters are gone");
  assert.equal((await listLpCountDays("e2", "2000-01-01")).length, 1, "P2's are untouched");
  assert.deepEqual(await listLpCountProjects(), [P2]);
});
