/** The microsite live-data seam on the OTHER backend: LOCAL_DB off, so the
 *  report-metrics dispatcher resolves to store.firestore.ts with `@/lib/firebase`
 *  redirected to the in-memory fake. Worth its own file (see
 *  distribution-variants-firestore.test.mjs): "works on both backends" is a claim,
 *  and the Firestore backend is genuinely different code (a JSON string field under
 *  `reportMetrics/{projectId}` vs a sqlite row). Pins the same branch selection as
 *  the sqlite twin: synced rows → live view; absent/cleared → disclosed sample. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);
// Swap `@/lib/firebase` for the fake BEFORE anything imports the store or registry.
register("./firestore-fake-hook.mjs", import.meta.url);

// LOCAL_DB deliberately unset → the dispatcher picks the Firestore backend.
delete process.env.LOCAL_DB;

const { resetFirestore, firestoreDump } = await import("./firestore-fake.mjs");
const { buildMicrositeView, resolveMicrositeView } = await import("@/lib/microsite");
const { saveReportMetrics, clearReportMetrics } = await import("@/lib/report-metrics/store");

const SITE = {
  slug: "acme-fs",
  tenant: "u_tester_proj_proj-fs-1",
  projectId: "proj-fs-1",
  clientName: "Acme FS",
  segment: "E-shop · nářadí",
  brandName: "Acme",
  accentColor: "#0f766e",
  periodDays: 30,
  enabled: true,
  illustrative: true,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function metricsBlob() {
  const rows = [];
  for (let i = 0; i < 45; i++) {
    const d = new Date(Date.UTC(2026, 5, 1) + i * 86_400_000).toISOString().slice(0, 10);
    rows.push({ date: d, visits: 80 + i, cost: 40 + i, conversions: 2, revenue: 700 + i * 5 });
  }
  return {
    meta: {
      source: "google-ads",
      customerId: "1234567890",
      syncedAt: "2026-07-16T06:00:00.000Z",
      days: 45,
      rowCount: rows.length,
    },
    rows,
  };
}

/** The view minus the `live` flag — comparable against buildMicrositeView's output. */
function body(view) {
  return { article: view.article, snapshot: view.snapshot, asOf: view.asOf };
}

test("[firestore] no blob → disclosed sample, byte-identical to buildMicrositeView", async () => {
  resetFirestore();
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});

test("[firestore] synced blob under reportMetrics/{projectId} → the live view", async () => {
  resetFirestore();
  await saveReportMetrics(SITE.projectId, metricsBlob());
  // The blob really is on the Firestore backend, under the project-scoped doc.
  assert.ok(firestoreDump().has(`reportMetrics/${SITE.projectId}`));
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, true);
  assert.equal(view.asOf, "2026-07-15");
  assert.match(view.article.faq[0].a.join(""), /reálné časové řady/i);
});

test("[firestore] clearing the sync reverts to the disclosed sample", async () => {
  resetFirestore();
  await saveReportMetrics(SITE.projectId, metricsBlob());
  await clearReportMetrics(SITE.projectId);
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});
