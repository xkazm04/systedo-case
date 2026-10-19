/** Technique band-and-suppressed-early-probability: the goal probability is a hard
 *  number only once enough of the month has elapsed AND there is a noise estimate.
 *  Pins (1) zero remaining noise on an unfinished month is not certainty, and
 *  (2) the AI recap grounding obeys the same gate as the dashboard card. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { monthlyPacing } from "@/lib/metrics/pacing";

const BASE = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);
const JSON_HOOK =
  "data:text/javascript," +
  encodeURIComponent(`
    export async function load(url, context, next) {
      if (url.endsWith('.json')) {
        return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
      }
      return next(url, context);
    }
  `);

function series(start, n, revenueAt) {
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
    visits: 1000, cost: 3000, conversions: 40, revenue: revenueAt(i),
  }));
}

let buildSnapshot;
let snapshotToPromptText;
before(async () => {
  register(JSON_HOOK, import.meta.url);
  const snap = await import("@/lib/snapshot");
  buildSnapshot = snap.buildSnapshot;
  snapshotToPromptText = snap.snapshotToPromptText;
});

test("a flat series mid-month has no noise estimate: probability is not quoted", () => {
  const daily = series("2026-03-20", 56, () => 1000); // ends 2026-05-14
  const p = monthlyPacing(daily, 40_000);
  assert.equal(p.complete, false);
  assert.equal(p.probabilityReliable, false);
});

test("a noisy series past the day gate still quotes the probability", () => {
  const daily = series("2026-03-20", 56, (i) => 1000 + (i % 5) * 150);
  const p = monthlyPacing(daily, 40_000);
  assert.equal(p.probabilityReliable, true);
  assert.ok(p.goalProbability >= 0 && p.goalProbability <= 1);
});

test("recap grounding withholds the probability early in the month", () => {
  // Latest day is the 3rd: 3 elapsed days < the 5-day gate.
  const daily = series("2026-01-01", 93, (i) => 12_000 + (i % 7) * 900);
  assert.equal(daily[daily.length - 1].date, "2026-04-03");
  const snap = buildSnapshot("30d", "previous", { ...BASE, daily });
  assert.equal(snap.pacing.probabilityReliable, false);
  const text = snapshotToPromptText(snap);
  assert.ok(text.includes("Pravděpodobnost splnění cíle: zatím se ustaluje"));
  assert.ok(!/Pravděpodobnost splnění cíle: \d/.test(text));
});

test("recap grounding quotes the probability once the gate opens", () => {
  const daily = series("2026-01-01", 100, (i) => 12_000 + (i % 7) * 900); // ends 2026-04-11
  const snap = buildSnapshot("30d", "previous", { ...BASE, daily });
  assert.equal(snap.pacing.probabilityReliable, true);
  assert.ok(/Pravděpodobnost splnění cíle: \d/.test(snapshotToPromptText(snap)));
});
