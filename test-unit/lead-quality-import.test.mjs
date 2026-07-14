/** Direction 2 — the lead funnel gets real: the tolerant CRM-lead parser, the
 *  aggregation into the funnel's LeadSource shape, the sqlite store roundtrip + the
 *  resolve seam (imported leads render over the sample), and the recap grounding's
 *  live/sample provenance label. Exercises the `lead_imports` table (DDL in
 *  src/lib/db.ts). Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-lead-imports-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { parseLeadRows, aggregateLeads, parseLeadDate } = await import("@/lib/lead-quality/import");
const { LEAD_ROW_CAP } = await import("@/lib/lead-quality/types");
const { saveLeadImports, getLeadImports, clearLeadImports } = await import("@/lib/lead-quality/store");
const { resolveLeadSources } = await import("@/lib/lead-quality/resolve");
const { leadSignalsText } = await import("@/lib/lead-signals/summary");

// --- parser -------------------------------------------------------------------

test("parseLeadRows: cs headers + stage values, quote-aware, drops undated/unknown-stage", () => {
  const csv = [
    "zdroj, fáze, datum, hodnota, datum uzavření",
    '"Google, Ads",uzavřeno,2026-05-02,48000,2026-05-20', // quoted source with a comma
    "Meta,lead,2026-05-05",
    "Meta,příležitost,3.5.2026", // cs date D.M.YYYY
    "Sklik,lead,not-a-date", // dropped: no parseable date
    "Sklik,šméčko,2026-05-01", // dropped: unknown stage
  ].join("\n");
  const rows = parseLeadRows(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { source: "Google, Ads", stage: "won", at: "2026-05-02", value: 48000, closedAt: "2026-05-20" });
  assert.equal(rows[1].stage, "lead");
  assert.equal(rows[2].stage, "opportunity");
  assert.equal(rows[2].at, "2026-05-03");
});

test("parseLeadRows: en headers + no-header fallback both work", () => {
  const en = parseLeadRows("source,stage,date\nGoogle,qualified,2026-05-01");
  assert.equal(en.length, 1);
  assert.equal(en[0].stage, "qualified");

  const noHeader = parseLeadRows("Google,won,2026-05-01,1000");
  assert.equal(noHeader.length, 1);
  assert.equal(noHeader[0].stage, "won");
  assert.equal(noHeader[0].value, 1000);
});

test("parseLeadRows: caps at LEAD_ROW_CAP", () => {
  const lines = [];
  for (let i = 0; i < LEAD_ROW_CAP + 25; i++) lines.push(`Src,lead,2026-05-01`);
  assert.equal(parseLeadRows(lines.join("\n")).length, LEAD_ROW_CAP);
});

test("parseLeadDate handles ISO, Czech D.M.YYYY, and rejects garbage", () => {
  assert.equal(parseLeadDate("2026-05-02"), "2026-05-02");
  assert.equal(parseLeadDate("2.5.2026"), "2026-05-02");
  assert.equal(parseLeadDate("nope"), null);
});

// --- aggregation --------------------------------------------------------------

test("aggregateLeads: cumulative stages, revenue from won, spend 0, honest opportunity/velocity", () => {
  const items = parseLeadRows(
    [
      "Google Ads,won,2026-05-02,48000,2026-05-20",
      "Google Ads,lead,2026-05-05",
      "Google Ads,qualified,2026-05-06",
      "Meta,lead,2026-05-01",
      "Meta,opportunity,2026-05-03",
    ].join("\n"),
  );
  const sources = aggregateLeads(items);
  // Sorted by lead volume desc → Google Ads (3) then Meta (2).
  const [ga, meta] = sources;
  assert.equal(ga.source, "Google Ads");
  assert.equal(ga.leads, 3);
  assert.equal(ga.qualified, 2); // won + qualified (both rank ≥ qualified)
  assert.equal(ga.won, 1);
  assert.equal(ga.spend, 0); // a CRM export carries no ad spend
  assert.equal(ga.revenue, 48000);
  assert.equal(ga.opportunities, undefined); // no explicit opportunity row → stage omitted
  assert.equal(ga.daysToClose, 18); // 2026-05-20 − 2026-05-02

  assert.equal(meta.leads, 2);
  assert.equal(meta.qualified, 1); // the opportunity row counts as qualified
  assert.equal(meta.opportunities, 1); // opportunity stage present → included
  assert.equal(meta.won, 0);
});

// --- store + resolve ----------------------------------------------------------

const SAMPLE = [{ source: "Sample", leads: 100, qualified: 50, won: 10, spend: 1000, revenue: 200_000 }];

test("resolveLeadSources: sample when empty, live after import, sample again after DELETE", async () => {
  const pid = "proj-leads-1";
  const before = await resolveLeadSources(pid, SAMPLE);
  assert.equal(before.live, false);
  assert.equal(before.source, "sample");
  assert.deepEqual(before.sources, SAMPLE);

  const now = new Date().toISOString();
  await saveLeadImports(pid, {
    items: parseLeadRows("Google,won,2026-05-02,5000,2026-05-10\nGoogle,lead,2026-05-04"),
    source: "import",
    syncedAt: now,
    updatedAt: now,
  });
  const stored = await getLeadImports(pid);
  assert.equal(stored.items.length, 2);

  const live = await resolveLeadSources(pid, SAMPLE);
  assert.equal(live.live, true);
  assert.equal(live.source, "import");
  assert.equal(live.sources[0].source, "Google");
  assert.equal(live.sources[0].leads, 2);

  await clearLeadImports(pid);
  const reverted = await resolveLeadSources(pid, SAMPLE);
  assert.equal(reverted.live, false);
  assert.deepEqual(reverted.sources, SAMPLE);
});

// --- grounding provenance -----------------------------------------------------

test("leadSignalsText: sample header unchanged, live header marks imported CRM data", () => {
  const sample = leadSignalsText(SAMPLE, { live: false });
  assert.ok(sample.startsWith("Kvalita a zdroje leadů (reálná, už spočítaná data — report na ně nesmí mlčet):"));

  const live = leadSignalsText(SAMPLE, { live: true });
  assert.ok(live.startsWith("Kvalita a zdroje leadů (reálná importovaná data z CRM — report na ně nesmí mlčet):"));
});

test("leadSignalsText: scales the sample to the report tile, never rescales live imports", () => {
  // Sample path reconciles to the tile's lead total (R02).
  const scaled = leadSignalsText(SAMPLE, { live: false, targetLeads: 200 });
  assert.match(scaled, /Leadů: 200/);
  // Live path ignores targetLeads — imported data is ground truth.
  const live = leadSignalsText(SAMPLE, { live: true, targetLeads: 200 });
  assert.match(live, /Leadů: 100/);
});
