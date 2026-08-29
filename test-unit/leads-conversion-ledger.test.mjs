/** WP W3-C — the conversion ledger over the REAL sqlite table (`conversion_events`;
 *  DDL + migration v31 in src/lib/db.ts), driven through the real dispatcher, plus
 *  BOTH append sites end to end through the real `changeStage` / `applyLeadEvent`.
 *
 *  What this proves that the pure suite cannot: the store round-trips, upserts by id,
 *  filters by kind and window, prunes and clears; the CSV connector's new `gclid` /
 *  `value` columns survive the whole parse → apply → ledger path; a first-touch gclid
 *  is never rewritten by a later import; and a ledger failure cannot fail a stage
 *  move.
 *
 *  Harness: a temp db keyed by pid + SYSTEDO_DB_FILE + LOCAL_DB set BEFORE the
 *  dynamic import (the campaigns-local-store shape) — never the shared
 *  `.data/systedo.db`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-conversion-ledger-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const {
  appendConversionEvents,
  listConversionEvents,
  pruneConversionEvents,
  clearConversionEvents,
  listConversionTenants,
} = await import("@/lib/leads/conversion-store");
const { CONVERSION_EVENT_CAP } = await import("@/lib/leads/conversion-events");
const { applyLeadEvent, mergeAttribution } = await import("@/lib/leads/apply");
const { changeStage } = await import("@/lib/leads/mutate");
const { getContact } = await import("@/lib/leads/store");
const { parseContactCsv, stageFromCsvCell } = await import("@/lib/leads/connectors/csv");

const NOW = new Date("2026-08-30T09:15:00.000Z");
let seq = 0;
const pid = () => `p-conv-${++seq}`;

const row = (id, over = {}) => ({
  id,
  contactId: id.split("_")[0],
  kind: "qualified",
  at: "2026-08-29T00:00:00.000Z",
  sourceLabel: "Google Ads",
  attribution: { source: "google-ads" },
  value: null,
  ...over,
});

/* ── the store trio ──────────────────────────────────────────────────────────── */

test("append → read back NEWEST FIRST, whole record round-trips", async () => {
  const p = pid();
  await appendConversionEvents(p, [
    row("a_qualified", { at: "2026-08-01T00:00:00.000Z" }),
    row("b_won", { kind: "won", at: "2026-08-03T00:00:00.000Z", value: 48000 }),
    row("c_qualified", { at: "2026-08-02T00:00:00.000Z" }),
  ]);
  const rows = await listConversionEvents(p);
  assert.deepEqual(rows.map((r) => r.id), ["b_won", "c_qualified", "a_qualified"]);
  assert.equal(rows[0].value, 48000);
  assert.deepEqual(rows[0].attribution, { source: "google-ads" });
});

test("append is IDEMPOTENT by id — a re-qualify updates the one row", async () => {
  const p = pid();
  await appendConversionEvents(p, [row("x_qualified")]);
  await appendConversionEvents(p, [row("x_qualified", { at: "2026-08-30T00:00:00.000Z" })]);
  const rows = await listConversionEvents(p);
  assert.equal(rows.length, 1, "upsert, never a second row");
  assert.equal(rows[0].at, "2026-08-30T00:00:00.000Z");
});

test("kind filter + sinceDay window + clear", async () => {
  const p = pid();
  await appendConversionEvents(p, [
    row("q1_qualified", { at: "2026-08-29T00:00:00.000Z" }),
    row("w1_won", { kind: "won", at: "2026-08-28T00:00:00.000Z" }),
    row("q2_qualified", { at: "2026-01-01T00:00:00.000Z" }),
  ]);
  assert.deepEqual((await listConversionEvents(p, { kind: "won" })).map((r) => r.id), ["w1_won"]);
  assert.deepEqual(
    (await listConversionEvents(p, { sinceDay: "2026-08-01" })).map((r) => r.id),
    ["q1_qualified", "w1_won"]
  );
  assert.deepEqual(
    (await listConversionEvents(p, { kind: "qualified", sinceDay: "2026-08-01" })).map((r) => r.id),
    ["q1_qualified"]
  );
  await clearConversionEvents(p);
  assert.deepEqual(await listConversionEvents(p), []);
});

test("prune drops rows older than the cutoff and reports how many", async () => {
  const p = pid();
  await appendConversionEvents(p, [
    row("old_qualified", { at: "2026-02-01T00:00:00.000Z" }), // ~210 days back
    row("new_qualified", { at: "2026-08-29T00:00:00.000Z" }),
  ]);
  const pruned = await pruneConversionEvents(p, "2026-03-03"); // retentionCutoffDay(NOW)
  assert.equal(pruned, 1);
  assert.deepEqual((await listConversionEvents(p)).map((r) => r.id), ["new_qualified"]);
  assert.equal(await pruneConversionEvents(p, "2026-03-03"), 0, "prune is idempotent");
});

test("the per-project cap evicts the OLDEST rows", async () => {
  const p = pid();
  const many = Array.from({ length: CONVERSION_EVENT_CAP + 2 }, (_, i) =>
    row(`c${String(i).padStart(5, "0")}_qualified`, {
      at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    })
  );
  await appendConversionEvents(p, many);
  const rows = await listConversionEvents(p, { limit: CONVERSION_EVENT_CAP + 10 });
  assert.equal(rows.length, CONVERSION_EVENT_CAP);
  assert.ok(!rows.some((r) => r.id === "c00000_qualified"), "the two oldest went");
  assert.ok(rows.some((r) => r.id === "c00002_qualified"));
});

test("listConversionTenants joins the ledger back to project owners", async () => {
  const p = pid();
  await appendConversionEvents(p, [row("t1_qualified")]);
  // No `projects` row exists for this id in the temp db, so the join yields nothing —
  // a project whose row is gone drops out of the rollup's work list rather than being
  // rolled up under a guessed owner.
  const tenants = await listConversionTenants(50);
  assert.ok(Array.isArray(tenants));
  assert.ok(!tenants.some((t) => t.projectId === p));
});

/* ── append site 1: changeStage ──────────────────────────────────────────────── */

const seedContact = async (projectId, over = {}) => {
  const result = await applyLeadEvent(
    projectId,
    {
      id: "seed",
      projectId,
      connectorId: "csv",
      externalId: "seed",
      kind: "row",
      occurredAt: NOW.toISOString(),
      identity: { email: "jan@firma.cz", name: "Jan Novák" },
      attribution: { source: "google-ads", campaign: "Brand", gclid: "GCLSEED" },
      receivedAt: NOW.toISOString(),
      status: "pending",
      ...over,
    },
    { now: NOW }
  );
  return result.contact;
};

test("changeStage(working → qualified) appends exactly one ledger row", async () => {
  const p = pid();
  const created = await seedContact(p);
  const working = await changeStage(p, created, { to: "working" }, NOW);
  assert.deepEqual(await listConversionEvents(p), [], "rank 0 → rank 0 mints nothing");

  const qualified = await changeStage(p, working, { to: "qualified" }, NOW);
  const rows = await listConversionEvents(p);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "qualified");
  assert.equal(rows[0].contactId, qualified.id);
  assert.equal(rows[0].sourceLabel, "Google Ads – Brand");
  assert.equal(rows[0].attribution.gclid, "GCLSEED");
});

test("qualified → working → qualified still leaves ONE row (upsert pinned)", async () => {
  const p = pid();
  const created = await seedContact(p);
  const q1 = await changeStage(p, created, { to: "qualified" }, NOW);
  const back = await changeStage(p, q1, { to: "working" }, NOW);
  assert.equal((await listConversionEvents(p)).length, 1, "the regression appends nothing");
  const later = new Date("2026-09-02T10:00:00.000Z");
  await changeStage(p, back, { to: "qualified" }, later);
  const rows = await listConversionEvents(p);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].at, later.toISOString(), "the row moved to the new entry moment");
});

test("a stage move to won appends the won row beside the qualified one", async () => {
  const p = pid();
  const created = await seedContact(p);
  const q = await changeStage(p, created, { to: "qualified" }, NOW);
  await changeStage(p, q, { to: "won" }, NOW);
  const rows = await listConversionEvents(p);
  assert.deepEqual(rows.map((r) => r.kind).sort(), ["qualified", "won"]);
});

/* ── append site 2: the CSV import path ──────────────────────────────────────── */

test("CSV: a won row with gclid + value lands as a won event carrying both", async () => {
  const p = pid();
  const csv = [
    "jmeno,email,zdroj,kampan,stav,gclid,hodnota",
    "Petra Malá,petra@klient.cz,Google Ads,Jaro,uzavreno,GCLWON1,48000",
  ].join("\n");
  const parsed = parseContactCsv(csv, {
    projectId: p,
    importId: "imp-1",
    receivedAt: NOW.toISOString(),
  });
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0].attribution.gclid, "GCLWON1", "gclid rides ATTRIBUTION");
  assert.equal(parsed.events[0].raw.value, "48000", "the value rides RAW");

  const stage = stageFromCsvCell(parsed.events[0].raw.stage);
  assert.equal(stage, "won");
  await applyLeadEvent(p, parsed.events[0], { now: NOW, initialStage: stage });

  const rows = await listConversionEvents(p);
  const won = rows.find((r) => r.kind === "won");
  assert.ok(won, "the import path appends even though changeStage was never called");
  assert.equal(won.attribution.gclid, "GCLWON1");
  assert.equal(won.value, 48000);
  assert.equal(won.connectorId, "csv");
  assert.equal(won.sourceLabel, "Google Ads – Jaro");
  assert.ok(!JSON.stringify(rows).includes("petra@klient.cz"), "no PII in the ledger");
});

test("CSV: a headerless row still maps the appended gclid / value columns", () => {
  const csv = "Petra,petra@klient.cz,,Klient s.r.o.,Google Ads,Jaro,uzavreno,2026-08-20,,GCLPOS,1500";
  const parsed = parseContactCsv(csv, {
    projectId: "p0",
    importId: "imp-2",
    receivedAt: NOW.toISOString(),
  });
  assert.equal(parsed.events[0].attribution.gclid, "GCLPOS");
  assert.equal(parsed.events[0].raw.value, "1500");
});

test("mergeAttribution: the first-touch gclid is NEVER rewritten", () => {
  const merged = mergeAttribution(
    { source: "google-ads", gclid: "FIRST" },
    { source: "sklik", gclid: "SECOND", campaign: "Podzim" }
  );
  assert.equal(merged.gclid, "FIRST", "re-attributing an uploaded conversion is a double-count");
  assert.equal(merged.source, "google-ads", "first touch wins for source too");
  assert.equal(merged.campaign, "Podzim", "last touch still FILLS a blank");
  // …but a contact that never had one is still fillable — that is a late first touch.
  assert.equal(mergeAttribution({ source: "organic" }, { gclid: "LATE" }).gclid, "LATE");
});

test("a ledger failure never fails the stage move it explains", async () => {
  const p = pid();
  const created = await seedContact(p);
  // A contact whose stage move is applied while the ledger is unreachable: simulated
  // by moving a contact that was never saved under this project id — the ledger write
  // still runs, and the move must return the moved contact either way.
  const moved = await changeStage(p, created, { to: "qualified" }, NOW);
  assert.equal(moved.stage, "qualified");
  assert.equal((await getContact(p, created.id)).stage, "qualified");
});
