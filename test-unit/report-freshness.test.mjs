/** Direction 1 — the report's live-metrics freshness decisions (pure, no store/clock):
 *  the cron's re-sync due-gate, the report's stale-banner rule, and the recap's
 *  staleness caveat all derive from one age helper (src/lib/report-metrics/freshness.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isResyncDue,
  isReportStale,
  daysSinceSync,
  staleCaveatText,
  RESYNC_MIN_HOURS,
  STALE_AFTER_DAYS,
} from "@/lib/report-metrics/freshness";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test("isResyncDue: never-synced (no/garbage timestamp) is always due", () => {
  assert.equal(isResyncDue(undefined, NOW), true);
  assert.equal(isResyncDue(null, NOW), true);
  assert.equal(isResyncDue("not-a-date", NOW), true);
});

test("isResyncDue: recent sync is NOT due (quota-safe); old sync IS due", () => {
  assert.equal(isResyncDue(hoursAgo(1), NOW), false);
  assert.equal(isResyncDue(hoursAgo(RESYNC_MIN_HOURS - 1), NOW), false);
  // exactly at the threshold → due (>=)
  assert.equal(isResyncDue(hoursAgo(RESYNC_MIN_HOURS), NOW), true);
  assert.equal(isResyncDue(hoursAgo(48), NOW), true);
});

test("isResyncDue: a future timestamp (clock skew) is NOT due — never thrash", () => {
  const future = new Date(NOW.getTime() + 3_600_000).toISOString();
  assert.equal(isResyncDue(future, NOW), false);
});

test("isReportStale: within the window is fresh; past it is stale", () => {
  assert.equal(isReportStale(daysAgo(1), NOW), false);
  assert.equal(isReportStale(daysAgo(STALE_AFTER_DAYS - 1), NOW), false);
  assert.equal(isReportStale(daysAgo(STALE_AFTER_DAYS), NOW), true);
  assert.equal(isReportStale(daysAgo(30), NOW), true);
});

test("isReportStale: never-synced is NOT stale (that's the sample state, not stale live data)", () => {
  assert.equal(isReportStale(undefined, NOW), false);
  assert.equal(isReportStale(null, NOW), false);
});

test("daysSinceSync: floored whole days, null when unknown/future", () => {
  assert.equal(daysSinceSync(daysAgo(9), NOW), 9);
  assert.equal(daysSinceSync(hoursAgo(30), NOW), 1);
  assert.equal(daysSinceSync(undefined, NOW), null);
  assert.equal(daysSinceSync(new Date(NOW.getTime() + 1000).toISOString(), NOW), null);
});

test("staleCaveatText: empty when fresh, a dated caveat when stale (both locales)", () => {
  assert.equal(staleCaveatText(daysAgo(1), NOW, "cs"), "");
  const cs = staleCaveatText(daysAgo(9), NOW, "cs");
  assert.match(cs, /9 dny/);
  assert.match(cs, /orientační/);
  const en = staleCaveatText(daysAgo(9), NOW, "en");
  assert.match(en, /9 days ago/);
  assert.match(en, /out of date/);
});
