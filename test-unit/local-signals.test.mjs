/** A2 local-signals: the tolerant rank-import parser, the ladder builder, the
 *  sqlite store roundtrip, and the resolver's live-vs-sample decision. Exercises the
 *  `local_signals` table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-local-signals-test.db");
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

const {
  parseRankRows,
  ladderFromRows,
  mergeLadder,
  normalizeLadder,
  normalizeSignals,
  parseReviewRows,
  parseGbpRows,
} = await import("@/lib/local-signals/import");
const { getLocalSignals, saveLocalSignals, clearLocalSignals } = await import("@/lib/local-signals/store");
const { resolveLocalLadder, resolveReviews, resolveLocations } = await import("@/lib/local-signals/resolve");

test("parser: header detection, mixed separators, dedup (last wins), rank clamp", () => {
  const rows = parseRankRows(
    [
      "klíčové slovo;oblast;pozice",
      "zubař;Žižkov;3",
      "zubař,Žižkov,5", // duplicate key → last wins (5)
      "implantáty\tVinohrady\t1",
      "ordinace;Žižkov;0", // rank < 1 → skipped
      "bad-row-only-one-cell",
    ].join("\n")
  );
  const byKey = Object.fromEntries(rows.map((r) => [`${r.keyword}|${r.area}`, r.rank]));
  assert.equal(byKey["zubař|Žižkov"], 5, "last write wins for a duplicate");
  assert.equal(byKey["implantáty|Vinohrady"], 1, "tab-separated row parsed");
  assert.equal(rows.length, 2, "rank<1 and short rows dropped");
});

test("parser: no header → assumes keyword,area,rank; clamps >100", () => {
  const rows = parseRankRows("zubař, Praha, 250");
  assert.deepEqual(rows, [{ keyword: "zubař", area: "Praha", rank: 100 }]);
});

test("parser: empty/blank input → []", () => {
  assert.deepEqual(parseRankRows("   \n\n"), []);
});

test("ladderFromRows: seeds a single date-stamped point; current/best from the rank", () => {
  const [k] = ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 3 }], "2026-07-01T00:00:00.000Z");
  assert.equal(k.current, 3);
  assert.equal(k.best, 3);
  assert.deepEqual(k.history, [{ rank: 3, at: "2026-07-01" }]);
  assert.equal(k.area, "Žižkov");
});

test("mergeLadder: stamps each import, appends dated points, keeps HISTORY_CAP", () => {
  let ladder = ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 5 }], "2026-05-01T00:00:00Z");
  ladder = mergeLadder(ladder, [{ keyword: "zubař", area: "Žižkov", rank: 3 }], "2026-06-01T00:00:00Z");
  ladder = mergeLadder(ladder, [{ keyword: "zubař", area: "Žižkov", rank: 2 }], "2026-07-01T00:00:00Z");
  const [k] = ladder;
  assert.deepEqual(
    k.history.map((p) => [p.rank, p.at]),
    [[5, "2026-05-01"], [3, "2026-06-01"], [2, "2026-07-01"]]
  );
  assert.equal(k.current, 2);
  assert.equal(k.best, 2); // min across the dated history
  // cap: 15 sequential imports retain only the last 12 points
  let capped = ladderFromRows([{ keyword: "k", area: "A", rank: 20 }], "2026-01-01T00:00:00Z");
  for (let i = 1; i <= 15; i++) {
    const at = new Date(Date.parse("2026-01-01T00:00:00Z") + i * 86_400_000).toISOString();
    capped = mergeLadder(capped, [{ keyword: "k", area: "A", rank: 20 - (i % 5) }], at);
  }
  assert.equal(capped[0].history.length, 12);
});

test("normalizeLadder: reads a LEGACY bare-number history cleanly (dual-shape)", () => {
  const legacy = [{ id: "s1", keyword: "x", area: "A", history: [9, 6, 4], current: 4, best: 4 }];
  const [k] = normalizeLadder(legacy, "2026-07-01T00:00:00Z");
  // coerced to dated points, newest anchored on the import time, oldest back-dated
  assert.equal(k.history.length, 3);
  assert.equal(k.history[2].at, "2026-07-01");
  assert.deepEqual(k.history.map((p) => p.rank), [9, 6, 4]);
  assert.equal(k.current, 4);
  assert.equal(k.best, 4);
  for (const p of k.history) assert.match(p.at, /^\d{4}-\d{2}-\d{2}$/);
});

test("normalizeLadder: passes a new-shape history through unchanged", () => {
  const fresh = [
    { id: "s1", keyword: "x", area: "A", history: [{ rank: 5, at: "2026-06-01" }, { rank: 3, at: "2026-07-01" }], current: 3, best: 3 },
  ];
  const [k] = normalizeLadder(fresh, "2026-07-01T00:00:00Z");
  assert.deepEqual(k.history, [{ rank: 5, at: "2026-06-01" }, { rank: 3, at: "2026-07-01" }]);
  assert.equal(k.best, 3);
});

test("normalizeSignals: coerces a legacy blob anchored on its own syncedAt", () => {
  const blob = {
    meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 1 },
    ladder: [{ id: "s1", keyword: "x", area: "A", history: [8, 2], current: 2, best: 2 }],
  };
  const out = normalizeSignals(blob);
  assert.equal(out.ladder[0].history[1].at, "2026-07-01");
  assert.equal(out.meta.source, "import"); // meta untouched
});

const SAMPLE = [{ id: "s1", keyword: "x", area: "A", history: [{ rank: 9, at: "2026-06-01" }], current: 9, best: 9 }];

test("resolver: no import → sample ladder, live=false", async () => {
  const res = await resolveLocalLadder("proj-local", SAMPLE);
  assert.equal(res.live, false);
  assert.equal(res.source, "sample");
  assert.deepEqual(res.ladder, SAMPLE);
});

test("resolver: after import → live ladder with provenance", async () => {
  await saveLocalSignals("proj-local", {
    meta: { source: "import", syncedAt: "2026-07-08T09:00:00.000Z", rowCount: 1 },
    ladder: ladderFromRows([{ keyword: "zubař", area: "Žižkov", rank: 2 }]),
  });
  const res = await resolveLocalLadder("proj-local", SAMPLE);
  assert.equal(res.live, true);
  assert.equal(res.source, "import");
  assert.equal(res.ladder[0].current, 2);
});

test("store: clear reverts to sample", async () => {
  assert.ok(await getLocalSignals("proj-local"));
  await clearLocalSignals("proj-local");
  assert.equal(await getLocalSignals("proj-local"), null);
  assert.equal((await resolveLocalLadder("proj-local", SAMPLE)).live, false);
});

// ── D2: reviews parser + live seam ──────────────────────────────────────────
test("parseReviewRows: header map, quoted comma-bearing text, rating clamp, date parse", () => {
  const rows = parseReviewRows(
    [
      "autor,hodnocení,text,datum,oblast",
      'Jana K.,5,"Skvělé, doporučuji všem",2026-06-01,Praha',
      "Petr M.,9,Fajn,01.05.2026,Brno", // rating clamps to 5; cs date D.M.YYYY
      "Eva H.,3,,2026-04-15,Praha", // empty text but has author → kept
      "NoDate,4,text bez data,,Praha", // no date → dropped
    ].join("\n")
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].text, "Skvělé, doporučuji všem"); // comma inside quotes preserved
  assert.equal(rows[0].rating, 5);
  assert.equal(rows[1].rating, 5); // 9 clamped to 5
  assert.equal(rows[1].at, "2026-05-01"); // 01.05.2026 → ISO
  assert.equal(rows[2].author, "Eva H.");
});

test("parseReviewRows: no header assumes author,rating,text,date,area; bad rating dropped", () => {
  const rows = parseReviewRows(["Jan,4,Dobré,2026-06-01,Praha", "X,abc,Nope,2026-06-02,Brno"].join("\n"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rating, 4);
});

test("resolveReviews: sample without import, live imported reviews after save", async () => {
  const SAMPLE_REVIEWS = [{ id: "s", author: "A", area: "Praha", rating: 5, text: "x", daysAgo: 1 }];
  const before = await resolveReviews("proj-rev", SAMPLE_REVIEWS);
  assert.equal(before.live, false);
  assert.deepEqual(before.reviews, SAMPLE_REVIEWS);

  const items = parseReviewRows("Jana K.,5,Skvělé,2026-06-01,Praha");
  await saveLocalSignals("proj-rev", {
    meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 0 },
    ladder: [],
    reviews: { meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: items.length }, items },
  });
  const now = Date.parse("2026-06-11T00:00:00Z");
  const after = await resolveReviews("proj-rev", SAMPLE_REVIEWS, now);
  assert.equal(after.live, true);
  assert.equal(after.source, "import");
  assert.equal(after.reviews[0].daysAgo, 10); // 2026-06-01 → 2026-06-11
  // empty ladder → ladder resolver still reports sample
  assert.equal((await resolveLocalLadder("proj-rev", SAMPLE)).live, false);
  await clearLocalSignals("proj-rev");
});

// ── D3: GBP parser + live seam ──────────────────────────────────────────────
test("parseGbpRows: header map, cs/en status, rating clamp, diacritic-insensitive dedup", () => {
  const rows = parseGbpRows(
    [
      "pobočka,stav,recenze,hodnocení,nezodpovězené",
      "Plzeň,připojeno,128,4.8,2",
      "plzen,odpojeno,130,9,0", // same location (diacritic/case) → last wins
      "Brno,vyžaduje akci,74,4.7,5",
      "Praha,connected,200,4.9,1",
      ",connected,10,5,0", // no name → dropped
    ].join("\n")
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(rows.length, 3);
  assert.equal(byName["plzen"].status, "disconnected"); // last write won
  assert.equal(byName["plzen"].rating, 5); // 9 clamped to 5
  assert.equal(byName["Brno"].status, "attention");
  assert.equal(byName["Praha"].status, "connected");
});

test("parseGbpRows: no header assumes name,status,reviews,rating,unanswered", () => {
  const rows = parseGbpRows("Ostrava,disconnected,31,4.5,3");
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].name, rows[0].status, rows[0].reviews, rows[0].rating, rows[0].unanswered],
    ["Ostrava", "disconnected", 31, 4.5, 3]
  );
});

const LOC = (over = {}) => ({
  id: "praha", name: "Praha", region: "Praha", services: 3, gbp: "connected",
  autopilot: true, rating: 4.6, reviews: 100, unanswered: 0, mapRank: 3,
  openTasks: 0, flagged: 0, drafts: 0, monthlyBudget: 10000, ...over,
});

test("resolveLocations: sample without import; imported GBP merged + unmatched appended", async () => {
  const sample = [LOC(), LOC({ id: "plzen", name: "Plzeň", mapRank: 5 })];
  const before = await resolveLocations("proj-gbp", sample);
  assert.equal(before.live, false);
  assert.deepEqual(before.rows, sample);

  const rows = parseGbpRows(
    ["Plzeň,odpojeno,140,4.2,4", "Kladno,vyžaduje akci,12,3.9,2"].join("\n")
  );
  await saveLocalSignals("proj-gbp", {
    meta: { source: "gbp", syncedAt: "2026-07-01T00:00:00Z", rowCount: 0 },
    ladder: [],
    gbp: { meta: { source: "gbp", syncedAt: "2026-07-01T00:00:00Z", rowCount: rows.length }, rows },
  });
  const after = await resolveLocations("proj-gbp", sample);
  assert.equal(after.live, true);
  assert.equal(after.source, "gbp");
  const plzen = after.rows.find((r) => r.name === "Plzeň");
  assert.equal(plzen.gbp, "disconnected"); // imported override
  assert.equal(plzen.reviews, 140);
  assert.equal(plzen.mapRank, 5); // seeded map rank preserved (export lacks it)
  const praha = after.rows.find((r) => r.name === "Praha");
  assert.equal(praha.gbp, "connected"); // untouched — not in the import
  const kladno = after.rows.find((r) => r.name === "Kladno");
  assert.ok(kladno, "unmatched imported row still renders");
  assert.equal(kladno.mapRank, 0); // unknown map rank
  await clearLocalSignals("proj-gbp");
});
