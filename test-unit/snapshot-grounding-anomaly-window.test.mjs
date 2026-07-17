/** Finding #1 — the AI grounding writer (snapshotToPromptText) must window the
 *  FULL-SERIES anomalies to the reported period. detectAnomalies scans the whole
 *  daily feed, but the "Významné události v období" block is headlined "in period"
 *  and ddmm() drops the year, so an out-of-window spike would render beside a
 *  last-30-days recap as though it happened this month. This proves an old spike is
 *  dropped from the grounding while a recent one survives.
 *
 *  snapshot.ts imports src/data/performance.json without an import attribute, so the
 *  same tiny JSON load hook as ai-analysis-grounding is registered here. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

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

let buildSnapshot;
let snapshotToPromptText;

const ddmm = (iso) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${Number(m)}.`;
};

before(async () => {
  register(JSON_HOOK, import.meta.url);
  const snap = await import("@/lib/snapshot");
  buildSnapshot = snap.buildSnapshot;
  snapshotToPromptText = snap.snapshotToPromptText;
});

test("grounding drops an out-of-window anomaly and keeps an in-window one", () => {
  // 140 flat days; a revenue spike 100 days before the end (well outside a 30d window)
  // and another on the very last day (in window). Flat cost keeps other metrics quiet.
  const start = new Date("2026-01-01T00:00:00Z").getTime();
  const daily = [];
  for (let i = 0; i < 140; i++) {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    let revenue = 12_000;
    if (i === 39 || i === 139) revenue = 120_000; // old spike + recent spike
    daily.push({ date, visits: 1000, cost: 3000, conversions: 40, revenue });
  }
  const oldDate = daily[39].date;
  const recentDate = daily[139].date;

  const data = { ...BASE, daily };
  const snap = buildSnapshot("30d", "previous", data);

  // Both spikes are in the full-series snapshot the artefact carries…
  assert.ok(
    snap.anomalies.some((a) => a.date === oldDate),
    "the old spike IS present in the full-series snapshot"
  );

  // …but only the in-window one reaches the grounding text.
  const text = snapshotToPromptText(snap);
  assert.ok(text.includes(`- ${ddmm(recentDate)}:`), "recent in-window spike appears in grounding");
  assert.ok(
    !text.includes(`- ${ddmm(oldDate)}:`),
    "old out-of-window spike is filtered from the 'v období' grounding"
  );
});
