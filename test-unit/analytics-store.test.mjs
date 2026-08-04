/** First-party analytics store, LOCAL sqlite backend (src/lib/analytics/
 *  store.local.ts via the LOCAL_DB dispatcher): the (metric, day) counter
 *  increments in place, and the since-day listing filters inclusively. Also pins
 *  the privacy posture at the schema level — a row is ONLY {metric, day, count}.
 *  Hermetic per-file db (mirrors onboarding-progress.test.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-analytics-store-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { bumpDailyMetric, listDailyMetricsSince } = await import("@/lib/analytics/store");

test("bump increments one (metric, day) counter in place", async () => {
  await bumpDailyMetric("view:/dashboard", "2026-08-01");
  await bumpDailyMetric("view:/dashboard", "2026-08-01");
  await bumpDailyMetric("view:/dashboard", "2026-08-02");
  await bumpDailyMetric("signup", "2026-08-02");
  const rows = await listDailyMetricsSince("2026-08-01");
  const find = (metric, day) => rows.find((r) => r.metric === metric && r.day === day);
  assert.equal(find("view:/dashboard", "2026-08-01")?.count, 2);
  assert.equal(find("view:/dashboard", "2026-08-02")?.count, 1);
  assert.equal(find("signup", "2026-08-02")?.count, 1);
});

test("since-day filter is inclusive and drops older days", async () => {
  const rows = await listDailyMetricsSince("2026-08-02");
  assert.ok(rows.every((r) => r.day >= "2026-08-02"));
  assert.equal(rows.length, 2);
});

test("a row carries ONLY metric/day/count — no identifiers, by construction", async () => {
  const [row] = await listDailyMetricsSince("2026-08-01");
  assert.deepEqual(Object.keys(row).sort(), ["count", "day", "metric"]);
});
