/** Bench regression (report-engine-02): isLiveMetrics must be total over any
 *  parseable stored blob. Both stores JSON.parse the blob and cast `as
 *  ReportMetrics` with no shape check, and resolve.ts calls isLiveMetrics OUTSIDE
 *  its try/catch — so a blob missing `rows` (partial write, manual edit, schema
 *  drift) must return false, not throw a TypeError that 500s every report page.
 *  Correct behaviour: `!!metrics && Array.isArray(metrics.rows) && rows.length > 0`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLiveMetrics } from "@/lib/report-metrics/types";

const meta = {
  source: "google-ads",
  customerId: "1234567890",
  syncedAt: "2026-06-01T00:00:00.000Z",
  days: 400,
  rowCount: 1,
};

const row = { date: "2026-06-01", visits: 10, cost: 100, conversions: 1, revenue: 500 };

test("well-formed blobs keep the existing rule (synced rows ⇒ live)", () => {
  assert.equal(isLiveMetrics(null), false, "no blob → not live");
  assert.equal(isLiveMetrics({ meta, rows: [] }), false, "empty rows → not live");
  assert.equal(isLiveMetrics({ meta, rows: [row] }), true, "synced rows → live");
});

test("a parseable blob missing `rows` is NOT live — it must not throw", () => {
  // A partial write / manual edit / schema drift can persist `{ meta }` alone; the
  // JSON.parse + `as ReportMetrics` cast lets it straight through to isLiveMetrics.
  assert.equal(
    isLiveMetrics({ meta }),
    false,
    "blob without rows must read as not-live instead of crashing the resolver"
  );
});

test("a blob whose `rows` is not an array is NOT live — it must not throw", () => {
  assert.equal(isLiveMetrics({ meta, rows: null }), false, "rows: null → not live");
});
