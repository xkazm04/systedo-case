/** WP W3-A — every recommendation carries a LOCALE-FREE identity.
 *
 *  `id` embeds the localized title, so it differs between cs and en and cannot key a
 *  ledger; `subjectKey` is the identity the advice ledger tracks. This suite is the
 *  enumerating pin: it runs `collectRecommendations` over a fixture project of every
 *  type, in BOTH locales, with every optional producer seam threaded, and asserts the
 *  two subjectKey SETS are identical. A producer that interpolates a translated word
 *  into its key fails here and nowhere else — the ledger would silently track the same
 *  signal twice, once per language, and never resolve either. Pure — no I/O. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);
const { collectRecommendations } = await import("@/lib/insights/aggregate");
const { subjectSlug } = await import("@/lib/insights/types");

const project = (id, type) => ({
  id,
  name: `P ${id}`,
  type,
  accentColor: "#14b8b1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
});

const TYPES = ["eshop", "app", "leadgen", "content", "local"];

/** Every optional seam threaded, so the local / publishing producers actually fire. */
const LOCAL_INPUT = {
  live: { coverage: true, ladder: true, reviews: true, pack: true },
  targets: [{ area: "Ústí nad Labem", service: "Bělení zubů", monthlyVolume: 1200, hasPage: false, rank: null }],
  ladder: [{ id: "b", keyword: "Implantáty · Plzeň", area: "Plzeň", history: [], current: 14, best: 9 }],
  reviews: [{ id: "r3", author: "C", area: "Brno", rating: 1, text: "hrozné", daysAgo: 5 }],
};
const PUBLISHING = {
  checks: [
    { channel: "linkedin", weekStart: "2026-08-24", count: 5, cap: 2, exceeded: true },
    { channel: "newsletter", weekStart: "2026-08-24", count: 0, cap: 1, exceeded: false },
    // cap null → no rec at all; here to prove the producer skips it in both locales.
    { channel: "blog", weekStart: "2026-08-24", count: 9, cap: null, exceeded: false },
  ],
};

const collect = (type, locale) =>
  collectRecommendations(project(`sk-${type}`, type), locale, LOCAL_INPUT, null, true, null, PUBLISHING);

const keysOf = (recs) => [...new Set(recs.map((r) => r.subjectKey))].sort();

// --- the parity pin ---------------------------------------------------------

test("every project type emits the SAME subjectKey set in cs and en", () => {
  for (const type of TYPES) {
    const cs = collect(type, "cs");
    const en = collect(type, "en");
    assert.ok(cs.length > 0, `${type}: producers emit recs`);
    assert.equal(cs.length, en.length, `${type}: same number of recs in both locales`);
    assert.deepEqual(
      keysOf(cs),
      keysOf(en),
      `${type}: a subjectKey differs between locales — a translated string leaked into an identity`
    );
    // The titles genuinely DO differ, which is what makes the assertion above mean
    // something: the keys are stable because they are built from entities, not text.
    assert.notDeepEqual(
      cs.map((r) => r.title).sort(),
      en.map((r) => r.title).sort(),
      `${type}: the fixture must actually translate, else the parity check is vacuous`
    );
  }
});

test("every rec has a non-empty, diacritic-free, lowercase subjectKey", () => {
  for (const type of TYPES) {
    for (const locale of ["cs", "en"]) {
      for (const r of collect(type, locale)) {
        assert.ok(r.subjectKey, `${type}/${locale}: rec "${r.id}" has no subjectKey`);
        assert.match(
          r.subjectKey,
          /^[a-z0-9]+[a-z0-9:|_.-]*$/,
          `${type}/${locale}: "${r.subjectKey}" is not a folded, lowercase identity`
        );
        assert.equal(
          r.subjectKey.normalize("NFD").replace(/[̀-ͯ]/g, ""),
          r.subjectKey,
          `${type}/${locale}: "${r.subjectKey}" carries diacritics`
        );
      }
    }
  }
});

test("subjectKeys are unique within a project's rec list", () => {
  for (const type of TYPES) {
    const recs = collect(type, "cs");
    const keys = recs.map((r) => r.subjectKey);
    assert.equal(
      new Set(keys).size,
      keys.length,
      `${type}: two recs share a subjectKey — the ledger would collapse them into one subject`
    );
  }
});

test("a subjectKey is entity-scoped, not just module-scoped", () => {
  // Two SKUs about to run out are two tracked subjects, not one "stock" subject.
  const stock = collect("eshop", "cs").filter((r) => r.subjectKey.startsWith("sklad-sezonnost:stockout"));
  assert.ok(stock.length >= 1, "the stock fixture produces at least one stockout rec");
  for (const r of stock) {
    assert.match(r.subjectKey, /^sklad-sezonnost:stockout(-risk)?:[a-z0-9-]+$/);
  }
});

test("the LOCAL coverage gap key is the folded service|area pair, shared by both producers", () => {
  const local = collect("local", "cs").find((r) => r.subjectKey.startsWith("lokalni:coverage-gap:"));
  const leadgen = collect("leadgen", "cs").find((r) => r.subjectKey.startsWith("lokalni:coverage-gap:"));
  assert.ok(local && leadgen, "both branches emit a coverage gap");
  assert.equal(local.subjectKey, `lokalni:coverage-gap:${subjectSlug("Bělení zubů")}|${subjectSlug("Ústí nad Labem")}`);
  assert.equal(local.subjectKey, "lokalni:coverage-gap:beleni-zubu|usti-nad-labem");
  // The leadgen branch reads its own SAMPLE_TARGETS, so the entity differs — but the
  // SHAPE is the same, which is what makes one ledger identity work across both.
  assert.match(leadgen.subjectKey, /^lokalni:coverage-gap:[a-z0-9-]+\|[a-z0-9-]+$/);
});

test("the publishing keys use the raw ChannelKey, never CHANNEL_KEY_LABELS", () => {
  const keys = keysOf(collect("content", "cs")).filter((k) => k.startsWith("kanaly:"));
  assert.ok(keys.includes("kanaly:over-cap:linkedin"), `over-cap key missing from ${JSON.stringify(keys)}`);
  assert.ok(keys.includes("kanaly:zero-planned:newsletter"), "zero-planned key missing");
  assert.ok(!keys.some((k) => k.includes("blog")), "a null cap emits nothing at all");
});

test("the seasonality key carries the MONTH INDEX, not the (Czech-only) month label", () => {
  for (const locale of ["cs", "en"]) {
    const peak = collect("eshop", locale).find((r) => r.subjectKey.startsWith("sklad-sezonnost:seasonal-peak:"));
    if (peak) assert.match(peak.subjectKey, /^sklad-sezonnost:seasonal-peak:(\d|1[01])$/);
  }
});

// --- snapshots --------------------------------------------------------------

test("a snapshot is a registered key with a finite number, or absent", () => {
  const REGISTERED = new Set(["poas", "ltvCac", "qualRate", "daysOfCover", "trafficChangePct"]);
  let withSnapshot = 0;
  for (const type of TYPES) {
    for (const r of collect(type, "cs")) {
      if (!r.snapshot) continue;
      withSnapshot += 1;
      assert.ok(REGISTERED.has(r.snapshot.key), `unregistered snapshot key "${r.snapshot.key}" on ${r.subjectKey}`);
      assert.ok(Number.isFinite(r.snapshot.value), `non-finite snapshot on ${r.subjectKey}`);
    }
  }
  assert.ok(withSnapshot >= 3, `expected several producers to snapshot, got ${withSnapshot}`);
});

test("the snapshot value is locale-independent too", () => {
  for (const type of TYPES) {
    const cs = new Map(collect(type, "cs").filter((r) => r.snapshot).map((r) => [r.subjectKey, r.snapshot]));
    for (const r of collect(type, "en")) {
      if (!r.snapshot) continue;
      assert.deepEqual(cs.get(r.subjectKey), r.snapshot, `${type}: snapshot drift on ${r.subjectKey}`);
    }
  }
});

test("subjectSlug folds diacritics, lowercases and collapses separators", () => {
  assert.equal(subjectSlug("Zdravý jídelníček"), "zdravy-jidelnicek");
  assert.equal(subjectSlug("  Google Ads – Search  "), "google-ads-search");
  assert.equal(subjectSlug("X / Twitter"), "x-twitter");
  assert.equal(subjectSlug("SKU-001"), "sku-001");
});
