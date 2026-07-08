/** A1 report-metrics seam: the pure mapper (Ads rows → daily), the live-dataset
 *  builder, the sqlite store roundtrip, and the resolver's live-vs-sample decision.
 *  The live Ads FETCH is credential-gated and not exercised here — everything the
 *  fetch feeds is. Exercises the `report_metrics` table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// The resolver/builder transitively import @/data/performance.json — register a
// JSON load hook before the dynamic imports below so plain `node --test` can load it.
register("./json-loader.mjs", import.meta.url);

// Throwaway db BEFORE the store lazily opens it.
const dbFile = join(tmpdir(), "systedo-report-metrics-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { mapAdsRowsToMetrics } = await import("@/lib/report-metrics/map");
const { buildLiveDataset } = await import("@/lib/report-metrics/build");
const { getReportMetrics, saveReportMetrics, clearReportMetrics } = await import("@/lib/report-metrics/store");
const { resolveReportDataset } = await import("@/lib/report-metrics/resolve");

const PROJECT = { id: "proj-ads", name: "Acme s.r.o.", type: "eshop", domain: "acme.cz" };

test("mapper: sums date-segmented rows, micros→CZK, clicks→visits", () => {
  const rows = mapAdsRowsToMetrics([
    { segments: { date: "2026-06-02" }, metrics: { clicks: 10, costMicros: "1500000", conversions: 2, conversionsValue: 4000 } },
    { segments: { date: "2026-06-01" }, metrics: { clicks: "5", costMicros: 500000, conversions: 1, conversionsValue: "1200" } },
    // second campaign, same day → summed into 2026-06-02
    { segments: { date: "2026-06-02" }, metrics: { clicks: 3, costMicros: "500000", conversions: 1, conversionsValue: 800 } },
    { metrics: { clicks: 99 } }, // no date → dropped
  ]);
  assert.deepEqual(rows, [
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
    { date: "2026-06-02", visits: 13, cost: 2, conversions: 3, revenue: 4800 },
  ]);
});

test("mapper: empty / malformed input never throws", () => {
  assert.deepEqual(mapAdsRowsToMetrics([]), []);
  assert.deepEqual(mapAdsRowsToMetrics([{ segments: { date: "2026-06-01" } }]), [
    { date: "2026-06-01", visits: 0, cost: 0, conversions: 0, revenue: 0 },
  ]);
});

test("builder: keeps the project's client label + goals, swaps in the live series", () => {
  const rows = [
    { date: "2026-06-02", visits: 13, cost: 2, conversions: 3, revenue: 4800 },
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
  ];
  const data = buildLiveDataset(PROJECT, rows);
  assert.equal(data.client.name, "Acme s.r.o.");
  assert.equal(data.daily.length, 2);
  assert.equal(data.daily[0].date, "2026-06-01"); // sorted ascending
  assert.equal(data.daily[1].revenue, 4800);
});

test("resolver: no synced rows → sample dataset, live=false", async () => {
  const res = await resolveReportDataset(PROJECT);
  assert.equal(res.live, false);
  assert.equal(res.source, "sample");
  assert.ok(res.data.daily.length > 0); // scaled sample fallback
});

test("resolver: after a sync → live dataset with provenance", async () => {
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1234567890", syncedAt: "2026-06-03T10:00:00.000Z", days: 400, rowCount: 2 },
    rows: [
      { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
      { date: "2026-06-02", visits: 13, cost: 2, conversions: 3, revenue: 4800 },
    ],
  });
  const res = await resolveReportDataset(PROJECT);
  assert.equal(res.live, true);
  assert.equal(res.source, "google-ads");
  assert.equal(res.customerId, "1234567890");
  assert.equal(res.data.daily.length, 2);
  assert.equal(res.data.daily[1].revenue, 4800);
});

test("store: empty rows sync is treated as sample (resolver ignores it)", async () => {
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1234567890", syncedAt: "2026-06-03T10:00:00.000Z", days: 400, rowCount: 0 },
    rows: [],
  });
  const res = await resolveReportDataset(PROJECT);
  assert.equal(res.live, false, "0-row sync must not flip the report to live");
});

test("store: clear reverts to sample", async () => {
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1", syncedAt: "2026-06-03T10:00:00.000Z", days: 400, rowCount: 1 },
    rows: [{ date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 }],
  });
  assert.equal((await getReportMetrics(PROJECT.id)).rows.length, 1);
  await clearReportMetrics(PROJECT.id);
  assert.equal(await getReportMetrics(PROJECT.id), null);
  assert.equal((await resolveReportDataset(PROJECT)).live, false);
});
