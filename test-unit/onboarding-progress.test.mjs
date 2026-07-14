/** Onboarding checklist (src/lib/onboarding/steps.ts + progress.ts): the
 *  type-aware step sets and the live self-completion of the two stores this
 *  direction taught the checklist about — the local-signals `ranks` step now
 *  completes on ladder OR reviews OR GBP, and e-shops gain a `costModel` step
 *  that completes when a cost model is saved. Uses the real LOCAL_DB sqlite
 *  stores as fixtures (mirrors local-signals.test.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-onboarding-progress-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { stepsForType } = await import("@/lib/onboarding/steps");
const { resolveOnboardingProgress } = await import("@/lib/onboarding/progress");
const { saveLocalSignals } = await import("@/lib/local-signals/store");
const { saveCostModel } = await import("@/lib/cost-model/store");

const iso = "2026-07-01T00:00:00.000Z";
// adsCustomerId is set so progress.ts settles the `ads` step from the project field
// and SKIPS the getAdsConnection() read — that store is Firestore-only (no LOCAL_DB
// twin), and letting it run would leak a credentials error into this hermetic test.
// These fixtures assert on the `ranks` / `costModel` steps, not `ads`.
const projectOf = (id, type) => ({
  id,
  name: "Fixture",
  type,
  accentColor: "#0891b2",
  adsCustomerId: "123-456-7890",
  createdAt: iso,
  updatedAt: iso,
});
const stepDone = (progress, key) => progress.steps.find((s) => s.key === key)?.done;

// --- step-set composition (pure) --------------------------------------------

test("eshop step set gains costModel between catalog and ads; scan→…→channels order", () => {
  assert.deepEqual(
    stepsForType("eshop").map((s) => s.key),
    ["scan", "catalog", "costModel", "ads", "channels"]
  );
});

test("other project types are byte-identical (no costModel, unchanged order)", () => {
  assert.deepEqual(stepsForType("app").map((s) => s.key), ["scan", "ads", "channels"]);
  assert.deepEqual(stepsForType("leadgen").map((s) => s.key), ["scan", "ads", "channels"]);
  assert.deepEqual(stepsForType("content").map((s) => s.key), ["scan", "channels"]);
  assert.deepEqual(
    stepsForType("local").map((s) => s.key),
    ["scan", "catalog", "ads", "ranks", "channels"]
  );
});

test("ranks step relabelled to the 'import local data' semantics", () => {
  const ranks = stepsForType("local").find((s) => s.key === "ranks");
  assert.equal(ranks.labelEn, "Import local data");
  assert.equal(ranks.labelCs, "Naimportovat lokální data");
  assert.equal(ranks.to, "mapa");
});

// --- live self-completion (seeded LOCAL_DB stores) --------------------------

test("local ranks step: not done when nothing imported", async () => {
  const progress = await resolveOnboardingProgress(projectOf("loc-empty", "local"), "u1");
  assert.equal(stepDone(progress, "ranks"), false);
});

test("local ranks step: self-completes on a REVIEWS import alone (no ladder)", async () => {
  await saveLocalSignals("loc-reviews", {
    meta: { source: "import", syncedAt: iso, rowCount: 0 },
    ladder: [],
    reviews: {
      meta: { source: "import", syncedAt: iso, rowCount: 1 },
      items: [{ id: "r1", author: "Jana", area: "Žižkov", rating: 5, text: "Skvělé", at: "2026-06-01" }],
    },
  });
  const progress = await resolveOnboardingProgress(projectOf("loc-reviews", "local"), "u1");
  assert.equal(stepDone(progress, "ranks"), true);
});

test("local ranks step: self-completes on a GBP import alone (no ladder)", async () => {
  await saveLocalSignals("loc-gbp", {
    meta: { source: "gbp", syncedAt: iso, rowCount: 0 },
    ladder: [],
    gbp: {
      meta: { source: "gbp", syncedAt: iso, rowCount: 1 },
      rows: [{ name: "Praha 3", status: "connected", reviews: 42, rating: 4.6, unanswered: 2 }],
    },
  });
  const progress = await resolveOnboardingProgress(projectOf("loc-gbp", "local"), "u1");
  assert.equal(stepDone(progress, "ranks"), true);
});

test("eshop costModel step: not done without a model, self-completes once saved", async () => {
  const before = await resolveOnboardingProgress(projectOf("shop-cm", "eshop"), "u1");
  assert.equal(stepDone(before, "costModel"), false);

  await saveCostModel("shop-cm", {
    grossMarginPct: 0.4,
    monthlyOverhead: 50000,
    perOrderCost: 60,
    updatedAt: iso,
  });
  const after = await resolveOnboardingProgress(projectOf("shop-cm", "eshop"), "u1");
  assert.equal(stepDone(after, "costModel"), true);
});
