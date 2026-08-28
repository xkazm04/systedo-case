/** Onboarding checklist (src/lib/onboarding/steps.ts + progress.ts): the
 *  type-aware step sets and the live self-completion of the two stores this
 *  direction taught the checklist about — the local-signals `ranks` step now
 *  completes on ladder OR reviews OR GBP, and e-shops gain a `costModel` step
 *  that completes when a cost model is saved. Uses the real LOCAL_DB sqlite
 *  stores as fixtures (mirrors local-signals.test.mjs).
 *
 *  ALSO PINS ADR-0009: `channels` is the first step after the scan in every type,
 *  and required (not optional) for app / content / leadgen — the three types that
 *  cannot complete "Připojit Google Ads" without an ad budget. The order and the
 *  per-type optionality are a product default, so they are asserted, not inferred;
 *  `complete` is deliberately unchanged by the promotion, which is asserted too (it
 *  has always counted every step, optional included). */
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

test("eshop: channels leads, then catalog → costModel → ads", () => {
  assert.deepEqual(
    stepsForType("eshop").map((s) => s.key),
    ["scan", "channels", "catalog", "costModel", "ads"]
  );
});

test("every type puts channels immediately after the scan", () => {
  assert.deepEqual(stepsForType("app").map((s) => s.key), ["scan", "channels", "ads"]);
  assert.deepEqual(stepsForType("leadgen").map((s) => s.key), ["scan", "channels", "ads"]);
  assert.deepEqual(stepsForType("content").map((s) => s.key), ["scan", "channels"]);
  assert.deepEqual(
    stepsForType("local").map((s) => s.key),
    ["scan", "channels", "catalog", "ads", "ranks"]
  );
});

test("channels is never behind the Google Ads connection", () => {
  for (const type of ["eshop", "app", "leadgen", "content", "local"]) {
    const keys = stepsForType(type).map((s) => s.key);
    const ads = keys.indexOf("ads");
    if (ads === -1) continue; // `content` has no ads step at all
    assert.ok(
      keys.indexOf("channels") < ads,
      `${type}: channels (${keys.indexOf("channels")}) must precede ads (${ads})`
    );
  }
});

test("channels is REQUIRED for app / content / leadgen, optional for eshop / local", () => {
  const optionalityOf = (type) => stepsForType(type).find((s) => s.key === "channels").optional;
  assert.equal(optionalityOf("app"), false, "a pre-launch app has no ad budget to connect");
  assert.equal(optionalityOf("content"), false);
  assert.equal(optionalityOf("leadgen"), false);
  assert.equal(optionalityOf("eshop"), true, "an e-shop has a catalog + storefront route too");
  assert.equal(optionalityOf("local"), true);
});

test("the per-type override does not leak into the shared definition", () => {
  // stepsForType clones on override; resolving `app` first must not leave `eshop`
  // required. A mutation bug here would flip a product default invisibly.
  stepsForType("app");
  assert.equal(stepsForType("eshop").find((s) => s.key === "channels").optional, true);
});

test("channels is the only self-serve step — every other one connects something", () => {
  const selfServe = stepsForType("eshop").filter((s) => s.selfServe).map((s) => s.key);
  assert.deepEqual(selfServe, ["channels"]);
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

test("promoting channels does NOT change completion: every step still counts", async () => {
  // `complete` has always been done === steps.length, optional steps included, so
  // ADR-0009 is ordering + labelling only. Pinned because "required" is exactly the
  // word that tempts a later edit into making optional steps stop counting.
  const progress = await resolveOnboardingProgress(projectOf("app-fresh", "app"), "u1");
  assert.equal(progress.total, 3);
  assert.equal(progress.steps.length, 3);
  assert.equal(progress.complete, false);
  assert.equal(progress.steps.filter((s) => s.optional === false).length, 1);
});
