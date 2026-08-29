/** ADR-0010 — the channel ledger's read side. A project holds one report-metrics
 *  section per ad platform; `blendSections` is the PURE derivation that turns those
 *  sections into one series plus a REAL per-platform channel mix, and the resolver
 *  is the only door onto it.
 *
 *  The load-bearing guarantee here is the NEGATIVE one: a single-source project must
 *  resolve exactly what it resolved before sections existed. The pin below is the
 *  literal HEAD's build.ts produced (`{...base, channels: [], events: undefined,
 *  daily, meta}`), written out independently of the new code, plus the exact key set
 *  HEAD's resolver returned — so a stray added key or a leaked sample channel mix
 *  fails loudly instead of quietly changing every live report. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// The resolver/builder transitively import @/data/performance.json — register a
// JSON load hook before the dynamic imports below so plain `node --test` can load it.
register("./json-loader.mjs", import.meta.url);

// Throwaway db BEFORE the store lazily opens it.
const dbFile = join(tmpdir(), "systedo-report-blend-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { blendSections, readSections, primarySource, sklikPointsToMetricRows } = await import(
  "@/lib/report-metrics/blend"
);
const { getReportSection, clearReportSection, getReportMetrics, saveReportMetrics } = await import(
  "@/lib/report-metrics/store"
);
const { resolveReportDataset } = await import("@/lib/report-metrics/resolve");
const { getProjectDataset } = await import("@/lib/project-data/dataset");

const PROJECT = { id: "proj-blend", name: "Acme s.r.o.", type: "eshop", domain: "acme.cz" };

const GOOGLE_ROWS = [
  { date: "2026-06-01", visits: 100, cost: 800, conversions: 5, revenue: 4000, clicks: 100, impressions: 2000 },
  { date: "2026-06-02", visits: 200, cost: 2400, conversions: 15, revenue: 16000, clicks: 200, impressions: 4000 },
];
const SKLIK_ROWS = [
  { date: "2026-06-01", visits: 100, cost: 400, conversions: 5, revenue: 1000, clicks: 100, impressions: 1000 },
  { date: "2026-06-02", visits: 100, cost: 400, conversions: 5, revenue: 3000, clicks: 100, impressions: 1000 },
];

const googleMeta = (extra = {}) => ({
  source: "google-ads",
  customerId: "1234567890",
  syncedAt: "2026-06-03T10:00:00.000Z",
  days: 400,
  rowCount: GOOGLE_ROWS.length,
  ...extra,
});
const sklikMeta = (extra = {}) => ({
  source: "sklik",
  customerId: "sklik",
  syncedAt: "2026-06-03T11:00:00.000Z",
  days: 90,
  rowCount: SKLIK_ROWS.length,
  currencyCode: "CZK",
  ...extra,
});

const dual = () => ({
  meta: googleMeta(),
  rows: GOOGLE_ROWS,
  sources: {
    "google-ads": { meta: googleMeta(), rows: GOOGLE_ROWS },
    sklik: { meta: sklikMeta(), rows: SKLIK_ROWS },
  },
});

test("legacy blob (no `sources`) reads as exactly one section, named by its own meta", () => {
  const legacy = { meta: googleMeta(), rows: GOOGLE_ROWS };
  const sections = readSections(legacy);
  assert.deepEqual(Object.keys(sections), ["google-ads"]);
  assert.deepEqual(sections["google-ads"], { meta: googleMeta(), rows: GOOGLE_ROWS });
  assert.equal(primarySource(sections), "google-ads");

  // One section blends to ITSELF: same rows, and NO channel mix — an account-level
  // sync cannot substantiate one, which is why buildLiveDataset neutralised it.
  const blended = blendSections(legacy);
  assert.deepEqual(blended.rows, GOOGLE_ROWS);
  assert.deepEqual(blended.channels, []);
  assert.equal(blended.channelDaily, undefined);
  assert.deepEqual(blended.sources, ["google-ads"]);
  assert.equal(blended.mixedCurrency, false);
});

test("a Sklik-only project is primary in its own right (no Google section to defer to)", () => {
  const sections = readSections({ meta: sklikMeta(), rows: SKLIK_ROWS });
  assert.equal(primarySource(sections), "sklik");
  assert.deepEqual(blendSections({ meta: sklikMeta(), rows: SKLIK_ROWS }).rows, SKLIK_ROWS);
});

test("two same-currency sections sum per day and yield one channel per platform", () => {
  const blended = blendSections(dual());
  assert.deepEqual(blended.sources, ["google-ads", "sklik"]);
  assert.equal(blended.mixedCurrency, false);
  assert.deepEqual(blended.rows, [
    { date: "2026-06-01", visits: 200, cost: 1200, conversions: 10, revenue: 5000, clicks: 200, impressions: 3000 },
    { date: "2026-06-02", visits: 300, cost: 2800, conversions: 20, revenue: 19000, clicks: 300, impressions: 5000 },
  ]);
  // The platform IS the channel: shares are each section's totals over the blend's.
  assert.deepEqual(
    blended.channels.map((c) => c.channel),
    ["Google Ads", "Sklik"]
  );
  assert.deepEqual(blended.channels[0].shares, {
    visits: 300 / 500,
    cost: 3200 / 4000,
    conversions: 20 / 30,
    revenue: 20000 / 24000,
  });
  assert.deepEqual(blended.channels[1].shares, {
    visits: 200 / 500,
    cost: 800 / 4000,
    conversions: 10 / 30,
    revenue: 4000 / 24000,
  });
  // Each dimension sums to 1 across channels — the ChannelShare contract.
  for (const dim of ["visits", "cost", "conversions", "revenue"]) {
    const sum = blended.channels.reduce((a, c) => a + c.shares[dim], 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `${dim} shares sum to ${sum}`);
  }
});

test("channelDaily is one point per day, index-parallel to channels, and shows a mix shift", () => {
  const blended = blendSections(dual());
  assert.deepEqual(
    blended.channelDaily.map((p) => p.date),
    ["2026-06-01", "2026-06-02"]
  );
  for (const point of blended.channelDaily) {
    assert.equal(point.shares.length, blended.channels.length);
  }
  // Day 1 the networks split visits evenly; day 2 Google takes two thirds. A static
  // aggregate mix projected onto every day could never show that.
  assert.equal(blended.channelDaily[0].shares[0].visits, 100 / 200);
  assert.equal(blended.channelDaily[1].shares[0].visits, 200 / 300);
  assert.equal(blended.channelDaily[1].shares[1].visits, 100 / 300);
});

test("sections in different currencies are NEVER blended — the primary is served, and flagged", () => {
  const mixed = {
    meta: googleMeta({ currencyCode: "EUR" }),
    rows: GOOGLE_ROWS,
    sources: {
      "google-ads": { meta: googleMeta({ currencyCode: "EUR" }), rows: GOOGLE_ROWS },
      sklik: { meta: sklikMeta(), rows: SKLIK_ROWS },
    },
  };
  const blended = blendSections(mixed);
  assert.equal(blended.mixedCurrency, true);
  // The primary alone — summing EUR into CZK would fabricate the total.
  assert.deepEqual(blended.rows, GOOGLE_ROWS);
  assert.deepEqual(blended.channels, []);
  // …but both sources are still reported, so the surface can say what it is hiding.
  assert.deepEqual(blended.sources, ["google-ads", "sklik"]);

  // An un-stamped section counts as the base CZK (absent has always meant CZK), so
  // this pair blends rather than being refused on a technicality.
  assert.equal(blendSections(dual()).mixedCurrency, false);
});

test("an empty or malformed section never becomes a channel (the per-section live rule)", () => {
  const halfWritten = {
    meta: googleMeta(),
    rows: GOOGLE_ROWS,
    sources: {
      "google-ads": { meta: googleMeta(), rows: GOOGLE_ROWS },
      sklik: { meta: sklikMeta({ rowCount: 0 }), rows: [] },
    },
  };
  const blended = blendSections(halfWritten);
  assert.deepEqual(blended.sources, ["google-ads"]);
  assert.deepEqual(blended.channels, []);
  assert.deepEqual(blended.rows, GOOGLE_ROWS);
  // Nothing live at all → an empty blend, never a throw.
  assert.deepEqual(blendSections(null), { rows: [], channels: [], sources: [], mixedCurrency: false });
});

test("the blended paid-traffic pair is emitted only when EVERY contributing row has it", () => {
  const legacySklik = SKLIK_ROWS.map(({ clicks, impressions, ...rest }) => rest);
  const blended = blendSections({
    meta: googleMeta(),
    rows: GOOGLE_ROWS,
    sources: {
      "google-ads": { meta: googleMeta(), rows: GOOGLE_ROWS },
      sklik: { meta: sklikMeta(), rows: legacySklik },
    },
  });
  // Google's clicks alone are NOT the blended day's clicks — absent beats a partial
  // sum that would silently understate CTR/CPC.
  assert.equal("clicks" in blended.rows[0], false);
  assert.equal("impressions" in blended.rows[0], false);
  assert.equal(blended.rows[0].visits, 200);
});

test("sklikPointsToMetricRows: clicks→visits, conversionValue→revenue, native CZK, sorted", () => {
  const rows = sklikPointsToMetricRows([
    { date: "2026-06-02", cost: 400, conversions: 5, conversionValue: 3000, clicks: 100, impressions: 1000 },
    { date: "2026-06-01", cost: 400, conversions: 5, conversionValue: 1000, clicks: 100, impressions: 1000 },
  ]);
  assert.deepEqual(rows, [
    { date: "2026-06-01", visits: 100, cost: 400, conversions: 5, revenue: 1000, clicks: 100, impressions: 1000 },
    { date: "2026-06-02", visits: 100, cost: 400, conversions: 5, revenue: 3000, clicks: 100, impressions: 1000 },
  ]);
  // A point without the optional pair keeps the fields ABSENT (no fabricated zeros),
  // and money is passed through untouched — the adapter already applied the money mode.
  const bare = sklikPointsToMetricRows([{ date: "2026-06-01", cost: 12, conversions: 0, conversionValue: 0 }]);
  assert.deepEqual(bare, [{ date: "2026-06-01", visits: 0, cost: 12, conversions: 0, revenue: 0 }]);
});

test("resolver: a dual-section project resolves TWO real channels and source 'multi'", async () => {
  await saveReportMetrics(PROJECT.id, dual());
  const resolved = await resolveReportDataset(PROJECT);
  assert.equal(resolved.live, true);
  assert.equal(resolved.data.channels.length, 2);
  assert.deepEqual(
    resolved.data.channels.map((c) => c.channel),
    ["Google Ads", "Sklik"]
  );
  assert.equal(resolved.source, "multi");
  assert.deepEqual(resolved.sources, ["google-ads", "sklik"]);
  // Provenance stays the PRIMARY section's (the blob's legacy top-level meta).
  assert.equal(resolved.customerId, "1234567890");
  assert.equal(resolved.syncedAt, "2026-06-03T10:00:00.000Z");
  // The per-day mix replaced the sample spine's — it must be parallel to the 2 channels.
  assert.equal(resolved.data.channelDaily.length, 2);
  assert.equal(resolved.data.channelDaily[0].shares.length, 2);
  // The daily series is the blended one.
  assert.deepEqual(
    resolved.data.daily.map((d) => d.cost),
    [1200, 2800]
  );
});

test("resolver: a mixed-currency project serves the primary alone and says so", async () => {
  await saveReportMetrics(PROJECT.id, {
    meta: googleMeta({ currencyCode: "EUR" }),
    rows: GOOGLE_ROWS,
    sources: {
      "google-ads": { meta: googleMeta({ currencyCode: "EUR" }), rows: GOOGLE_ROWS },
      sklik: { meta: sklikMeta(), rows: SKLIK_ROWS },
    },
  });
  const resolved = await resolveReportDataset(PROJECT);
  assert.equal(resolved.mixedCurrency, true);
  assert.deepEqual(resolved.sources, ["google-ads", "sklik"]);
  // Not "multi": what is on screen is one network, honestly labelled as that one.
  assert.equal(resolved.source, "google-ads");
  assert.deepEqual(resolved.data.channels, []);
  assert.equal(resolved.currencyCode, "EUR");
  assert.deepEqual(
    resolved.data.daily.map((d) => d.cost),
    [800, 2400]
  );
});

test("resolver: a single-section project is byte-identical to the pre-ADR-0010 output", async () => {
  const legacy = { meta: googleMeta(), rows: GOOGLE_ROWS };
  await saveReportMetrics(PROJECT.id, legacy);
  const fromLegacy = await resolveReportDataset(PROJECT);

  // The pin: exactly the object HEAD's buildLiveDataset returned, written out here
  // independently of the new code path.
  const base = getProjectDataset(PROJECT);
  assert.deepStrictEqual(fromLegacy.data, {
    ...base,
    channels: [],
    events: undefined,
    daily: [
      { date: "2026-06-01", visits: 100, cost: 800, conversions: 5, revenue: 4000, impressions: 2000, clicks: 100 },
      { date: "2026-06-02", visits: 200, cost: 2400, conversions: 15, revenue: 16000, impressions: 4000, clicks: 200 },
    ],
    meta: { disclaimer: "", asOf: "2026-06-02", days: 2, seed: 0 },
  });
  // …including the sample spine's own channelDaily riding along untouched (channels
  // is [], so every consumer suppresses the block — that was true before too).
  assert.deepStrictEqual(fromLegacy.data.channelDaily, base.channelDaily);
  // And the EXACT key set HEAD's resolver returned — no new keys on a single source.
  assert.deepEqual(Object.keys(fromLegacy).sort(), [
    "customerId",
    "data",
    "live",
    "source",
    "stale",
    "syncedAt",
  ]);
  assert.equal(fromLegacy.source, "google-ads");

  // The SAME project written in the new sectioned shape resolves identically — that
  // is the whole compatibility claim of the sections wrapper.
  await saveReportMetrics(PROJECT.id, {
    ...legacy,
    sources: { "google-ads": { meta: googleMeta(), rows: GOOGLE_ROWS } },
  });
  assert.deepStrictEqual(await resolveReportDataset(PROJECT), fromLegacy);
});

test("store: a section is readable, clearable, and clearing the last one clears the blob", async () => {
  await saveReportMetrics(PROJECT.id, dual());
  assert.deepEqual((await getReportSection(PROJECT.id, "sklik")).rows, SKLIK_ROWS);
  assert.equal((await getReportSection(PROJECT.id, "google-ads")).meta.customerId, "1234567890");

  // Dropping Google promotes Sklik to primary AND rewrites the legacy top-level pair,
  // so a reader that predates sections sees the surviving section, not a stale ghost.
  await clearReportSection(PROJECT.id, "google-ads");
  const left = await getReportMetrics(PROJECT.id);
  assert.equal(left.meta.source, "sklik");
  assert.deepEqual(left.rows, SKLIK_ROWS);
  assert.equal(await getReportSection(PROJECT.id, "google-ads"), null);

  // Clearing the last section clears the blob → the report reverts to sample data.
  await clearReportSection(PROJECT.id, "sklik");
  assert.equal(await getReportMetrics(PROJECT.id), null);
  assert.equal((await resolveReportDataset(PROJECT)).source, "sample");

  // A legacy (pre-sections) blob is clearable through the same door.
  await saveReportMetrics(PROJECT.id, { meta: googleMeta(), rows: GOOGLE_ROWS });
  await clearReportSection(PROJECT.id, "google-ads");
  assert.equal(await getReportMetrics(PROJECT.id), null);
});
