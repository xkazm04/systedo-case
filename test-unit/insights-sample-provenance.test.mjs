/** Direction: every seeded number wears its label. `collectRecommendations` must tag
 *  every rec with the provenance of the SIGNAL it derived from — not just the local
 *  branch. Fail-closed: with nothing threaded (no liveness), every producer's recs are
 *  sample-tagged; the metrics seam (`metricsLive` = hasSyncedMetrics) untags ONLY the
 *  dataset-derived recs (profit, seasonality), never the static-fixture ones (stock,
 *  leads, experiments, decay, channel plan). Pure — no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const { collectRecommendations } = await import("@/lib/insights/aggregate");

const project = (id, type) => ({
  id,
  name: `P ${id}`,
  type,
  accentColor: "#14b8b1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
});

const TYPES = ["eshop", "app", "leadgen", "content", "local"];

test("fail-closed: with nothing threaded, EVERY rec of every project type is sample-tagged", () => {
  for (const type of TYPES) {
    const recs = collectRecommendations(project(`prov-${type}`, type), "cs");
    assert.ok(recs.length > 0, `${type}: producers emit recs`);
    for (const r of recs) {
      assert.equal(r.sample, true, `${type} rec "${r.id}" must disclose sample provenance`);
    }
  }
});

test("metrics seam untags ONLY dataset-derived eshop recs (profit/seasonality), not fixtures", () => {
  const p = project("prov-eshop-live", "eshop");
  const recs = collectRecommendations(p, "cs", null, null, true);

  const zisk = recs.filter((r) => r.module === "zisk");
  for (const r of zisk) {
    assert.notEqual(r.sample, true, `dataset-derived rec "${r.id}" untagged when metrics are live`);
  }

  // Stock recs read SAMPLE_PRODUCTS (no warehouse seam) — still tagged even when live.
  const stock = recs.filter(
    (r) =>
      r.module === "sklad-sezonnost" &&
      !(r.title.includes("špička") || r.title.includes("peak"))
  );
  assert.ok(stock.length > 0, "stock fixtures still emit recs");
  for (const r of stock) {
    assert.equal(r.sample, true, `fixture rec "${r.id}" stays tagged with live metrics`);
  }

  // The seasonality rec (same module, dataset-derived) is untagged when present.
  for (const r of recs.filter(
    (r) => r.module === "sklad-sezonnost" && (r.title.includes("špička") || r.title.includes("peak"))
  )) {
    assert.notEqual(r.sample, true, "seasonality follows the metrics seam");
  }
});

test("the cross-type channel rec and non-eshop fixtures stay tagged regardless of the metrics seam", () => {
  for (const type of TYPES) {
    const recs = collectRecommendations(project(`prov-live-${type}`, type), "cs", null, null, true);
    const channel = recs.find((r) => r.module === "kanaly");
    if (channel) assert.equal(channel.sample, true, `${type}: seeded channel plan stays tagged`);
    if (type === "leadgen" || type === "content" || type === "app") {
      for (const r of recs) {
        assert.equal(r.sample, true, `${type} rec "${r.id}" is fixture-derived → tagged`);
      }
    }
  }
});

test("local threading is untouched: live seams untag their recs, sample seams keep the tag", () => {
  const input = {
    live: { coverage: true, ladder: false, reviews: true, pack: false },
    targets: [{ area: "Praha", service: "Bělení zubů", monthlyVolume: 1200, hasPage: false, rank: null }],
    ladder: [{ id: "b", keyword: "Implantáty · Praha", area: "Praha", history: [], current: 14, best: 9 }],
    reviews: [{ id: "r3", author: "C", area: "Brno", rating: 1, text: "hrozné", daysAgo: 5 }],
  };
  const recs = collectRecommendations(project("prov-local", "local"), "cs", input);
  const gap = recs.find((r) => r.title.includes("Chybí stránka"));
  const weak = recs.find((r) => r.title.includes("Slabá pozice"));
  const neg = recs.find((r) => r.title.includes("recenz"));
  assert.ok(gap && weak && neg, "all three local recs fire");
  assert.notEqual(gap.sample, true, "live coverage → untagged");
  assert.equal(weak.sample, true, "sample ladder → tagged");
  assert.notEqual(neg.sample, true, "live reviews → untagged");
});
