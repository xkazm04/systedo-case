/** Weekly-digest diagnosis scheduling (src/lib/diagnoses/schedule.ts): the pure
 *  once-per-week + skip-sample-only decision the "Diagnóza týdne" cron gates on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldRunWeeklyDiagnosis,
  WEEKLY_DIAGNOSIS_MIN_GAP_MS,
} from "@/lib/diagnoses/schedule";

const NOW = Date.parse("2026-07-13T09:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

test("skips sample-only tenants regardless of history", () => {
  assert.equal(shouldRunWeeklyDiagnosis({ hasLiveData: false, lastRunAt: null, now: NOW }), false);
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: false, lastRunAt: iso(NOW - 30 * 86_400_000), now: NOW }),
    false
  );
});

test("runs for a connected tenant that has never had a digest diagnosis", () => {
  assert.equal(shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: null, now: NOW }), true);
});

test("suppresses a re-run inside the weekly window, allows it once elapsed", () => {
  // 2 days ago → inside the 6-day gap → skip (a manual cron re-trigger mid-week).
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: iso(NOW - 2 * 86_400_000), now: NOW }),
    false
  );
  // Exactly at the gap boundary → run.
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: iso(NOW - WEEKLY_DIAGNOSIS_MIN_GAP_MS), now: NOW }),
    true
  );
  // A full week ago → run.
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: iso(NOW - 7 * 86_400_000), now: NOW }),
    true
  );
});

test("an unparseable lastRunAt is treated as no prior run (runs, never forever-skips)", () => {
  assert.equal(shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: "not-a-date", now: NOW }), true);
});

test("respects a custom min gap", () => {
  const oneDay = 86_400_000;
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: iso(NOW - 2 * oneDay), now: NOW, minGapMs: oneDay }),
    true
  );
  assert.equal(
    shouldRunWeeklyDiagnosis({ hasLiveData: true, lastRunAt: iso(NOW - oneDay / 2), now: NOW, minGapMs: oneDay }),
    false
  );
});
