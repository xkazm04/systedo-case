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
const { getProjectDataset } = await import("@/lib/project-data/dataset");

const PROJECT = { id: "proj-ads", name: "Acme s.r.o.", type: "eshop", domain: "acme.cz" };

test("mapper: sums date-segmented rows, micros→CZK, clicks→visits + first-class clicks/impressions", () => {
  const rows = mapAdsRowsToMetrics([
    { segments: { date: "2026-06-02" }, metrics: { impressions: "1000", clicks: 10, costMicros: "1500000", conversions: 2, conversionsValue: 4000 } },
    { segments: { date: "2026-06-01" }, metrics: { impressions: 500, clicks: "5", costMicros: 500000, conversions: 1, conversionsValue: "1200" } },
    // second campaign, same day → summed into 2026-06-02
    { segments: { date: "2026-06-02" }, metrics: { impressions: 300, clicks: 3, costMicros: "500000", conversions: 1, conversionsValue: 800 } },
    { metrics: { clicks: 99 } }, // no date → dropped
  ]);
  assert.deepEqual(rows, [
    // visits STAYS the clicks proxy; clicks/impressions are carried first-class (D1).
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200, clicks: 5, impressions: 500 },
    { date: "2026-06-02", visits: 13, cost: 2, conversions: 3, revenue: 4800, clicks: 13, impressions: 1300 },
  ]);
});

test("mapper: empty / malformed input never throws (impressions default 0)", () => {
  assert.deepEqual(mapAdsRowsToMetrics([]), []);
  assert.deepEqual(mapAdsRowsToMetrics([{ segments: { date: "2026-06-01" } }]), [
    { date: "2026-06-01", visits: 0, cost: 0, conversions: 0, revenue: 0, clicks: 0, impressions: 0 },
  ]);
});

test("builder: live rows carry clicks/impressions onto canonical DailyPoint; legacy rows stay clean", () => {
  // A fresh sync (D1) carries the paid-traffic pair → CTR/CPC computable downstream.
  const live = buildLiveDataset(PROJECT, [
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200, clicks: 5, impressions: 500 },
  ]);
  assert.equal(live.daily[0].impressions, 500);
  assert.equal(live.daily[0].clicks, 5);
  // A legacy blob (synced before D1) lacks the pair → the fields must be ABSENT, not 0,
  // so the metrics engine's optional-field guards stay honest.
  const legacy = buildLiveDataset(PROJECT, [
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
  ]);
  assert.equal("impressions" in legacy.daily[0], false);
  assert.equal("clicks" in legacy.daily[0], false);
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

test("builder: overwrites the sample spine's meta so no sample provenance rides live data", () => {
  const sample = getProjectDataset(PROJECT);
  const data = buildLiveDataset(PROJECT, [
    { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
    { date: "2026-06-03", visits: 8, cost: 2, conversions: 2, revenue: 2400 },
  ]);
  assert.equal(data.meta.asOf, "2026-06-03", "asOf = last synced date, not the sample span");
  assert.equal(data.meta.days, 2, "days = synced row count");
  assert.equal(data.meta.disclaimer, "", "the sample-data disclaimer must not ride real numbers");
  assert.equal(data.meta.seed, 0, "no fabricated determinism seed");
  assert.notEqual(data.meta.asOf, sample.meta.asOf, "meta no longer describes the sample series");
});

test("builder: carries a captured non-CZK currency into the tile model; CZK/absent stay base", () => {
  const base = getProjectDataset(PROJECT);
  const rows = [{ date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 }];
  // Absent → base client.currency, byte-identical to before.
  assert.equal(buildLiveDataset(PROJECT, rows).client.currency, base.client.currency);
  assert.equal(buildLiveDataset(PROJECT, rows, undefined).client.currency, base.client.currency);
  // Junk / base code → base (never a malformed label).
  assert.equal(buildLiveDataset(PROJECT, rows, "nonsense").client.currency, base.client.currency);
  assert.equal(buildLiveDataset(PROJECT, rows, "CZK").client.currency, base.client.currency);
  // A captured foreign code is carried through, normalized.
  assert.equal(buildLiveDataset(PROJECT, rows, "eur").client.currency, "EUR");
  assert.equal(buildLiveDataset(PROJECT, rows, "USD").client.currency, "USD");
});

test("resolver: surfaces a captured non-CZK currency; CZK/absent omit it (byte-identical)", async () => {
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1234567890", syncedAt: "2026-06-03T10:00:00.000Z", days: 400, rowCount: 1, currencyCode: "EUR" },
    rows: [{ date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 }],
  });
  const eur = await resolveReportDataset(PROJECT);
  assert.equal(eur.currencyCode, "EUR");
  assert.equal(eur.data.client.currency, "EUR");
  // A CZK / un-captured sync exposes NO currencyCode (report stays base-formatted).
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1234567890", syncedAt: "2026-06-03T10:00:00.000Z", days: 400, rowCount: 1 },
    rows: [{ date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 }],
  });
  const czk = await resolveReportDataset(PROJECT);
  assert.equal(czk.currencyCode, undefined);
  await clearReportMetrics(PROJECT.id);
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
