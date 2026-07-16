/** Direction 1 — Výkon works fully offline. Proves the generic per-tenant document
 *  adapter (table `campaign_docs`, migration v16) AND that the four campaign-data
 *  stores (campaigns, series, snapshots, reports) read/write end-to-end through it
 *  under LOCAL_DB, so the whole Výkon surface no longer hard-500s when Firestore is
 *  unreachable. Runs the REAL store functions against the local backend.
 *
 *  Out of scope (documented): the alerts/changeSets/mutations/activity/patterns
 *  sub-collections still hit Firestore and may 500 offline — reports.saveReport's
 *  best-effort activity/alert side-writes are among them, so this test seeds the
 *  report reads via the adapter (addDoc) rather than driving that write path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-campaign-docs-${process.pid}.db`);
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

const { tenantStore } = await import("@/lib/campaigns/store/backend");
const {
  upsertCampaigns,
  listCampaigns,
  getCampaign,
  getSyncMeta,
  setActivePeriod,
} = await import("@/lib/campaigns/store/campaigns");
const { saveSeries, getSeries, saveCampaignSeries, getCampaignSeries } = await import(
  "@/lib/campaigns/store/series"
);
const { listSnapshotSummaries, getLatestChanges } = await import(
  "@/lib/campaigns/store/snapshots"
);
const { getReportsForPeriod, findCachedReport, getReportHistory } = await import(
  "@/lib/campaigns/store/reports"
);

const camp = (id, over = {}) => ({
  id,
  name: `Campaign ${id}`,
  type: "search",
  status: "enabled",
  impressions: 1000,
  clicks: 100,
  cost: 5000,
  conversions: 20,
  conversionValue: 40000,
  ...over,
});

// --- the adapter primitives (CRUD, merge, id-range, period query) --------------

test("adapter: set/get roundtrip + delete", async () => {
  const s = await tenantStore();
  assert.equal(await s.getDoc("t1", "campaigns", "x"), undefined);
  await s.setDoc("t1", "campaigns", "x", { a: 1, period: "7d" });
  assert.deepEqual(await s.getDoc("t1", "campaigns", "x"), { a: 1, period: "7d" });
  // plain set overwrites the whole doc (no merge)
  await s.setDoc("t1", "campaigns", "x", { b: 2 });
  assert.deepEqual(await s.getDoc("t1", "campaigns", "x"), { b: 2 });
  const batch = s.batch("t1");
  batch.delete("campaigns", "x");
  await batch.commit();
  assert.equal(await s.getDoc("t1", "campaigns", "x"), undefined);
});

test("adapter: set-merge deep-merges nested maps like Firestore (syncedByPeriod)", async () => {
  const s = await tenantStore();
  await s.setRoot("t-merge", { period: "7d", syncedByPeriod: { "7d": "A" } }, { merge: true });
  await s.setRoot("t-merge", { period: "30d", syncedByPeriod: { "30d": "B" } }, { merge: true });
  const root = await s.getRoot("t-merge");
  // scalar replaced, nested map merged (both periods retained)
  assert.equal(root.period, "30d");
  assert.deepEqual(root.syncedByPeriod, { "7d": "A", "30d": "B" });
});

test("adapter: queryEq on the indexed period column", async () => {
  const s = await tenantStore();
  await s.setDoc("t-eq", "campaigns", "30d_a", { id: "a", period: "30d" });
  await s.setDoc("t-eq", "campaigns", "7d_a", { id: "a", period: "7d" });
  await s.setDoc("t-eq", "campaigns", "30d_b", { id: "b", period: "30d" });
  const rows = await s.queryEq("t-eq", "campaigns", "period", "30d");
  assert.deepEqual(new Set(rows.map((r) => r.id)).size, 2);
  assert.ok(rows.every((r) => r.data.period === "30d"));
});

test("adapter: idRange returns the newest N within a doc-id range, desc", async () => {
  const s = await tenantStore();
  for (const id of ["30d__2026-01", "30d__2026-02", "30d__2026-03", "7d__2026-09"]) {
    await s.setDoc("t-range", "snapshots", id, { id });
  }
  const rows = await s.idRange("t-range", "snapshots", {
    gte: "30d__",
    lt: "30d__",
    limit: 2,
    dir: "desc",
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ["30d__2026-03", "30d__2026-02"]
  );
});

// --- the four stores end-to-end (real functions, local backend) ----------------

test("campaigns: upsert → list / getCampaign / getSyncMeta roundtrip offline", async () => {
  const tenant = "u_eshop";
  await upsertCampaigns(tenant, [camp("a"), camp("b", { cost: 8000 })], {
    source: "sample",
    period: "30d",
    currency: "CZK",
  });

  const list = await listCampaigns(tenant);
  assert.deepEqual(
    list.map((c) => c.id).sort(),
    ["a", "b"]
  );
  assert.equal(list.find((c) => c.id === "b").cost, 8000);

  const one = await getCampaign(tenant, "a");
  assert.equal(one.name, "Campaign a");

  const meta = await getSyncMeta(tenant);
  assert.equal(meta.period, "30d");
  assert.equal(meta.source, "sample");
  assert.equal(meta.currency, "CZK");
  assert.equal(meta.syncedByPeriod["30d"] > "", true);
});

test("campaigns: a second period coexists; setActivePeriod flips the warm pointer", async () => {
  const tenant = "u_two_periods";
  await upsertCampaigns(tenant, [camp("a")], { source: "sample", period: "30d" });
  await upsertCampaigns(tenant, [camp("a"), camp("c")], { source: "sample", period: "7d" });

  // active pointer is now 7d (last sync); both periods are stored warm.
  assert.deepEqual(
    (await listCampaigns(tenant, "7d")).map((c) => c.id).sort(),
    ["a", "c"]
  );
  assert.deepEqual(
    (await listCampaigns(tenant, "30d")).map((c) => c.id).sort(),
    ["a"]
  );

  const flipped = await setActivePeriod(tenant, "30d");
  assert.equal(flipped.period, "30d");
  assert.deepEqual(
    (await listCampaigns(tenant)).map((c) => c.id),
    ["a"]
  );
  // flipping to a cold (never-synced) period returns null → caller re-syncs.
  assert.equal(await setActivePeriod(tenant, "90d"), null);
});

test("series: portfolio + per-campaign series roundtrip per period", async () => {
  const tenant = "u_series";
  const pts = [
    { date: "2026-07-01", cost: 100, conversions: 1, conversionValue: 900 },
    { date: "2026-07-02", cost: 120, conversions: 2, conversionValue: 1800 },
  ];
  await saveSeries(tenant, pts, { period: "30d" });
  await saveCampaignSeries(tenant, { a: pts }, { period: "30d" });

  assert.deepEqual(await getSeries(tenant, "30d"), pts);
  assert.deepEqual((await getCampaignSeries(tenant, "30d")).a, pts);
  // a period with no stored series reads empty, not a throw.
  assert.deepEqual(await getSeries(tenant, "7d"), []);
});

test("snapshots: summaries + sync-over-sync diff read back offline", async () => {
  const tenant = "u_diff";
  // First sync: a + b.
  await upsertCampaigns(tenant, [camp("a"), camp("b")], { source: "sample", period: "30d" });
  // Second sync: a grows a lot, b removed, c added → the diff must see all three.
  await upsertCampaigns(
    tenant,
    [camp("a", { cost: 12000, conversionValue: 90000 }), camp("c")],
    { source: "sample", period: "30d" }
  );

  const summaries = await listSnapshotSummaries(tenant, 12, "30d");
  assert.equal(summaries.length, 2, "one triaged point per sync");

  const changes = await getLatestChanges(tenant, "30d");
  assert.ok(changes, "two snapshots of the same period → a diff");
  assert.equal(changes.added, 1); // c
  assert.equal(changes.removed, 1); // b
  const cChange = changes.items.find((i) => i.campaignId === "c");
  assert.equal(cChange.kind, "added");
});

test("reports: period + cache + history reads dispatch to the local backend", async () => {
  const tenant = "u_reports";
  const store = await tenantStore();
  // Seed reports directly via the adapter (saveReport's activity/alert side-writes
  // are out-of-scope Firestore paths, deliberately not driven offline).
  const base = {
    scope: "overall",
    campaign_id: null,
    model: "test",
    demo: false,
    prompt: "p",
    took_ms: 10,
  };
  await store.addDoc(tenant, "reports", {
    ...base,
    period: "30d",
    payload: { score: 70, verdict: "ok" },
    created_at: "2026-07-01T00:00:00.000Z",
    input_hash: "h1",
  });
  await store.addDoc(tenant, "reports", {
    ...base,
    period: "30d",
    payload: { score: 82, verdict: "better" },
    created_at: "2026-07-02T00:00:00.000Z",
    input_hash: "h2",
  });

  const forPeriod = await getReportsForPeriod(tenant, "30d");
  // last write per (scope) wins → the newer score.
  assert.equal(forPeriod.overall.result.score, 82);

  const cached = await findCachedReport(tenant, "overall", null, "30d", "h1");
  assert.equal(cached.result.score, 70);
  assert.equal(await findCachedReport(tenant, "overall", null, "30d", "nope"), null);

  const history = await getReportHistory(tenant, "overall", null);
  assert.deepEqual(
    history.map((h) => h.score),
    [70, 82]
  );
});
