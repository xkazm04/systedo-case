/** Microsite live-data seam (src/lib/microsite.ts, LOCAL_DB backend): the public
 *  /m/{slug} view substitutes the owning project's REAL synced series only when
 *  `isLiveMetrics` says so, and otherwise stays BYTE-IDENTICAL to the disclosed
 *  sample view. The integrity rule under test: a view is either fully synced-real
 *  or fully disclosed-sample — never a blend — and the flip reverses the moment
 *  the sync is cleared. The metrics rows ride the same report-metrics store the
 *  Monthly Report reads (sqlite here; the Firestore twin is
 *  microsite-view-firestore.test.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// microsite.ts imports the article/dataset spine (→ @/data/performance.json) and
// `@/lib/firebase` (registry — untouched by the view resolver, but the import must
// not pull real firebase-admin into a unit test).
register("./json-loader.mjs", import.meta.url);
register("./firestore-fake-hook.mjs", import.meta.url);

// Throwaway sqlite db BEFORE the store lazily opens it.
const dbFile = join(tmpdir(), "systedo-microsite-view-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { buildMicrositeView, resolveMicrositeView, DEMO_MICROSITE } = await import("@/lib/microsite");
const { saveReportMetrics, clearReportMetrics } = await import("@/lib/report-metrics/store");

/** A microsite bound to an owning project (as enableMicrosite now writes). */
const SITE = {
  slug: "acme",
  tenant: "u_tester_proj_proj-ms-1",
  projectId: "proj-ms-1",
  clientName: "Acme s.r.o.",
  segment: "E-shop · nářadí",
  brandName: "Acme",
  accentColor: "#0f766e",
  periodDays: 30,
  enabled: true,
  illustrative: true,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/** 60 deterministic synced days ending 2026-07-30 — enough for a 30d window + baseline. */
function syncedRows() {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 5, 1) + i * 86_400_000).toISOString().slice(0, 10);
    rows.push({ date: d, visits: 100 + i, cost: 50 + i, conversions: 3, revenue: 900 + i * 10 });
  }
  return rows;
}

function metricsBlob(overrides = {}) {
  const rows = syncedRows();
  return {
    meta: {
      source: "google-ads",
      customerId: "1234567890",
      syncedAt: "2026-07-31T06:00:00.000Z",
      days: 60,
      rowCount: rows.length,
      ...overrides,
    },
    rows,
  };
}

/** The FAQ provenance answer — the claim that travels with the article. */
function provenanceAnswer(article) {
  return article.faq[0].a.join("");
}

/** The view minus the `live` flag — comparable against buildMicrositeView's output. */
function body(view) {
  return { article: view.article, snapshot: view.snapshot, asOf: view.asOf };
}

test("no owning project (built-in demo) → disclosed sample, byte-identical to buildMicrositeView", async () => {
  const view = await resolveMicrositeView(DEMO_MICROSITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(DEMO_MICROSITE));
  assert.match(provenanceAnswer(view.article), /ilustrativní/i);
});

test("owning project with NO synced metrics → still the exact disclosed-sample view", async () => {
  await clearReportMetrics(SITE.projectId);
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});

test("synced rows exist → the REAL series renders: live view, synced provenance, no sample residue", async () => {
  await saveReportMetrics(SITE.projectId, metricsBlob());
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, true);

  // The series is the synced one: asOf is the last SYNCED date (the sample series
  // ends elsewhere), and the totals come from the stored rows.
  assert.equal(view.asOf, "2026-07-30");
  const expectedRevenue = syncedRows()
    .slice(-30)
    .reduce((s, r) => s + r.revenue, 0);
  assert.equal(view.snapshot.current.revenue, expectedRevenue);

  // Honest claim travels with the article (perex + FAQ), and the page-level flip
  // has a true source signal to act on.
  assert.match(provenanceAnswer(view.article), /reálné časové řady/i);
  assert.doesNotMatch(view.article.meta.perex, /[Ii]lustrativní/);

  // INTEGRITY: no sample-series content blends into the live view — the sample
  // channel mix (and its article table) must be gone, not projected onto real totals.
  assert.deepEqual(view.snapshot.channels, []);
  assert.equal(
    view.article.blocks.some((b) => b.type === "h2" && b.id === "kanaly"),
    false
  );
});

test("empty rows blob is NOT live (isLiveMetrics rule: synced rows, not a linked account)", async () => {
  await saveReportMetrics(SITE.projectId, { ...metricsBlob(), rows: [] });
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});

test("a non-CZK account stays on the disclosed sample (the article formats koruny)", async () => {
  await saveReportMetrics(SITE.projectId, metricsBlob({ currencyCode: "EUR" }));
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});

test("clearing the sync reverts the page to the disclosed sample — no stale 'real data' claim", async () => {
  await saveReportMetrics(SITE.projectId, metricsBlob());
  assert.equal((await resolveMicrositeView(SITE)).live, true);
  await clearReportMetrics(SITE.projectId);
  const view = await resolveMicrositeView(SITE);
  assert.equal(view.live, false);
  assert.deepEqual(body(view), buildMicrositeView(SITE));
});
