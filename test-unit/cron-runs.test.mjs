/** Direction 3 — durable cron run records. Covers the PURE pieces (record shape +
 *  truncation, the last-run-per-cron health projection, the retention decision)
 *  and the local sqlite store roundtrip (write + ~20/cron retention on write +
 *  the health projection over what's stored). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), "systedo-cron-runs-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const {
  buildCronRunRecord,
  projectCronHealth,
  recordsToEvict,
  CRON_RUN_RETENTION,
  MAX_RECORD_RESULTS,
} = await import("@/lib/cron/run-record");

test("buildCronRunRecord: shape, duration, and results/errors truncation", () => {
  const started = new Date("2026-07-14T06:00:00.000Z");
  const finished = new Date("2026-07-14T06:00:02.500Z");
  const results = Array.from({ length: MAX_RECORD_RESULTS + 5 }, (_, i) => ({ i }));
  const rec = buildCronRunRecord("report", started, finished, {
    ok: false,
    counts: { pairs: 25, sent: 20, failed: 5 },
    results,
    errors: [{ e: "boom" }, { e: "bang" }],
  });

  assert.equal(rec.cron, "report");
  assert.equal(rec.startedAt, "2026-07-14T06:00:00.000Z");
  assert.equal(rec.finishedAt, "2026-07-14T06:00:02.500Z");
  assert.equal(rec.durationMs, 2500);
  assert.equal(rec.ok, false);
  assert.deepEqual(rec.counts, { pairs: 25, sent: 20, failed: 5 });
  // Results capped to the max; errors kept (under the cap); truncated flag set.
  assert.equal(rec.results.length, MAX_RECORD_RESULTS);
  assert.equal(rec.errors.length, 2);
  assert.equal(rec.truncated, true);
  assert.ok(rec.id.startsWith("report_"));
});

test("buildCronRunRecord: never-negative duration; empty results untruncated", () => {
  const rec = buildCronRunRecord("social", new Date("2026-07-14T06:00:05Z"), new Date("2026-07-14T06:00:00Z"), {
    ok: true,
    counts: { published: 3, failed: 0 },
  });
  assert.equal(rec.durationMs, 0); // clamped, not negative
  assert.deepEqual(rec.results, []);
  assert.deepEqual(rec.errors, []);
  assert.equal(rec.truncated, false);
});

test("projectCronHealth: reduces to the most-recent run per cron, sorted by name", () => {
  const runs = [
    buildCronRunRecord("sync", new Date("2026-07-14T04:00:00Z"), new Date("2026-07-14T04:00:01Z"), { ok: true, counts: { synced: 1 } }),
    buildCronRunRecord("sync", new Date("2026-07-14T05:00:00Z"), new Date("2026-07-14T05:00:01Z"), { ok: false, counts: { synced: 2, failed: 1 } }),
    buildCronRunRecord("report", new Date("2026-07-14T06:00:00Z"), new Date("2026-07-14T06:00:01Z"), { ok: true, counts: { sent: 4 } }),
  ];
  const health = projectCronHealth(runs);
  assert.deepEqual(health.map((h) => h.cron), ["report", "sync"]);
  const sync = health.find((h) => h.cron === "sync");
  // The 05:00 run wins over 04:00.
  assert.equal(sync.finishedAt, "2026-07-14T05:00:01.000Z");
  assert.equal(sync.ok, false);
  assert.deepEqual(sync.counts, { synced: 2, failed: 1 });
});

test("recordsToEvict: keeps newest `retention` per cron, evicts the rest", () => {
  const rows = [
    { id: "a1", cron: "sync", finishedAt: "2026-07-14T01:00:00Z" },
    { id: "a2", cron: "sync", finishedAt: "2026-07-14T02:00:00Z" },
    { id: "a3", cron: "sync", finishedAt: "2026-07-14T03:00:00Z" },
    { id: "b1", cron: "report", finishedAt: "2026-07-14T01:00:00Z" },
  ];
  // retention 2: sync keeps a3,a2 → evict a1; report has only 1 → nothing.
  assert.deepEqual(recordsToEvict(rows, 2).sort(), ["a1"]);
  // retention 1: sync keeps a3 → evict a1,a2; report keeps b1.
  assert.deepEqual(recordsToEvict(rows, 1).sort(), ["a1", "a2"]);
});

test("local store: writes runs, caps at ~20/cron on write, projects health", async () => {
  const { saveCronRun, listRecentCronRuns } = await import("@/lib/cron/runs-store.local");

  // Write RETENTION + 5 runs for one cron, ascending finishedAt.
  for (let i = 0; i < CRON_RUN_RETENTION + 5; i++) {
    const t = new Date(Date.UTC(2026, 6, 14, 0, i, 0));
    await saveCronRun(
      buildCronRunRecord("sync", t, new Date(t.getTime() + 1000), { ok: true, counts: { synced: i } })
    );
  }
  // Plus one run for a second cron.
  const rt = new Date(Date.UTC(2026, 6, 14, 6, 0, 0));
  await saveCronRun(buildCronRunRecord("report", rt, new Date(rt.getTime() + 1000), { ok: true, counts: { sent: 2 } }));

  const all = await listRecentCronRuns();
  const syncRuns = all.filter((r) => r.cron === "sync");
  // Retention enforced on write: only the newest RETENTION sync rows survive.
  assert.equal(syncRuns.length, CRON_RUN_RETENTION);
  // The newest survivor is the last-written (minute 24), the oldest kept is minute 5.
  const minutes = syncRuns.map((r) => Number(r.counts.synced)).sort((a, b) => a - b);
  assert.equal(minutes[0], 5);
  assert.equal(minutes[minutes.length - 1], CRON_RUN_RETENTION + 4);

  const health = projectCronHealth(all);
  assert.deepEqual(health.map((h) => h.cron), ["report", "sync"]);
  const syncHealth = health.find((h) => h.cron === "sync");
  assert.equal(syncHealth.counts.synced, CRON_RUN_RETENTION + 4); // most-recent run
});
