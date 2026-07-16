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
  ladderKey,
  mergeLadder,
  normalizeLadder,
  normalizeSignals,
  parseReviewRows,
  parseReviews,
  parseReviewDate,
  reviewDateAmbiguous,
  parseGbpRows,
  parseCoverageRows,
  parseHasPage,
  mergeCoverage,
} = await import("@/lib/local-signals/import");
const { getLocalSignals, saveLocalSignals, clearLocalSignals, mutateLocalSignals } = await import(
  "@/lib/local-signals/store"
);
const { resolveLocalLadder, resolveReviews, resolveLocations, resolveCoverage } = await import(
  "@/lib/local-signals/resolve"
);
const { profilesFromReviews } = await import("@/lib/local/compute");

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

// ── D2: subset retention, slug collision, atomic mutate, ambiguous dates ─────
test("mergeLadder: a subset re-import RETAINS omitted keywords, flags them untracked", () => {
  let ladder = mergeLadder(
    [],
    [
      { keyword: "zubař", area: "Praha", rank: 5 },
      { keyword: "implantáty", area: "Praha", rank: 8 },
    ],
    "2026-05-01T00:00:00Z"
  );
  // Second import covers ONLY zubař — implantáty must survive with its history intact.
  ladder = mergeLadder(ladder, [{ keyword: "zubař", area: "Praha", rank: 3 }], "2026-06-01T00:00:00Z");
  const byKw = Object.fromEntries(ladder.map((k) => [k.keyword, k]));
  assert.equal(ladder.length, 2, "omitted keyword not deleted");
  assert.equal(byKw["zubař"].current, 3);
  assert.equal(byKw["zubař"].untracked, false, "re-imported keyword is tracked");
  assert.equal(byKw["implantáty"].current, 8, "omitted keyword keeps its position");
  assert.equal(byKw["implantáty"].history.length, 1, "omitted keyword history preserved, no new point");
  assert.equal(byKw["implantáty"].untracked, true, "omitted keyword flagged untracked");
  // Re-including it clears the flag and appends a point.
  const back = mergeLadder(ladder, [{ keyword: "implantáty", area: "Praha", rank: 6 }], "2026-07-01T00:00:00Z");
  const impl = back.find((k) => k.keyword === "implantáty");
  assert.equal(impl.untracked, false);
  assert.equal(impl.history.length, 2);
  assert.equal(impl.current, 6);
});

test("mergeLadder: 'Praha 4' vs 'Praha-4' do NOT collide (slug-collision fix)", () => {
  assert.notEqual(ladderKey("zubař", "Praha 4"), ladderKey("zubař", "Praha-4"));
  const ladder = mergeLadder(
    [],
    [
      { keyword: "zubař", area: "Praha 4", rank: 3 },
      { keyword: "zubař", area: "Praha-4", rank: 9 },
    ],
    "2026-06-01T00:00:00Z"
  );
  assert.equal(ladder.length, 2, "two distinct areas stay two rows");
  assert.equal(new Set(ladder.map((k) => k.id)).size, 2, "ids are unique");
});

test("mergeLadder: legacy slug-id rows re-key by keyword×area pair (history preserved)", () => {
  // A pre-fix stored row carries the old `area-keyword` slug id but real keyword/area.
  const legacy = [
    { id: "praha-zubař", keyword: "zubař", area: "Praha", history: [{ rank: 7, at: "2026-05-01" }], current: 7, best: 7 },
  ];
  const merged = mergeLadder(legacy, [{ keyword: "zubař", area: "Praha", rank: 4 }], "2026-06-01T00:00:00Z");
  assert.equal(merged.length, 1, "matched legacy row by pair, not a new entry");
  assert.equal(merged[0].history.length, 2, "history appended onto the legacy row");
  assert.equal(merged[0].current, 4);
});

test("parseReviewDate: ambiguous US/EU slash date is REJECTED, not mis-parsed", () => {
  // 05/01/2026 — could be 5 Jan (US) or 1 May (EU); both plausible → rejected.
  assert.equal(parseReviewDate("05/01/2026"), null);
  assert.equal(reviewDateAmbiguous("05/01/2026"), true);
  // 25/12/2026 — 25 can only be a day → unambiguous, day-first.
  assert.equal(parseReviewDate("25/12/2026"), "2026-12-25");
  assert.equal(reviewDateAmbiguous("25/12/2026"), false);
  // Dot dates stay European day-first (unambiguous by convention).
  assert.equal(parseReviewDate("01.05.2026"), "2026-05-01");
  assert.equal(reviewDateAmbiguous("01.05.2026"), false);
  // ISO passes through; garbage is 'none', not 'ambiguous'.
  assert.equal(parseReviewDate("2026-06-01"), "2026-06-01");
  assert.equal(reviewDateAmbiguous("hello"), false);
});

test("parseReviews: counts ambiguous rows; unambiguous rows unchanged", () => {
  const { items, ambiguous } = parseReviews(
    [
      "autor,hodnocení,text,datum,oblast",
      "Jana K.,5,OK,2026-06-01,Praha", // ISO → kept
      "Petr M.,4,Fajn,05/01/2026,Brno", // ambiguous slash → rejected + counted
      "Eva H.,3,Dobré,25/12/2026,Praha", // unambiguous slash → kept
    ].join("\n")
  );
  assert.equal(items.length, 2);
  assert.equal(ambiguous, 1);
  assert.equal(items[1].at, "2026-12-25");
});

test("mutateLocalSignals: atomic section update preserves the OTHER sections", async () => {
  // Seed ranks, then a reviews mutate and a gbp mutate — each must keep the rest.
  await mutateLocalSignals("proj-atomic", () => ({
    meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 1 },
    ladder: ladderFromRows([{ keyword: "zubař", area: "Praha", rank: 3 }], "2026-07-01T00:00:00Z"),
  }));
  await mutateLocalSignals("proj-atomic", (prev) => ({
    meta: prev.meta,
    ladder: prev.ladder,
    reviews: { meta: { source: "import", syncedAt: "2026-07-02T00:00:00Z", rowCount: 1 }, items: parseReviewRows("Jana,5,Skvělé,2026-06-01,Praha") },
  }));
  await mutateLocalSignals("proj-atomic", (prev) => ({
    meta: prev.meta,
    ladder: prev.ladder,
    ...(prev.reviews ? { reviews: prev.reviews } : {}),
    gbp: { meta: { source: "gbp", syncedAt: "2026-07-03T00:00:00Z", rowCount: 1 }, rows: parseGbpRows("Praha,connected,128,4.8,2") },
  }));
  const final = await getLocalSignals("proj-atomic");
  assert.equal(final.ladder.length, 1, "ladder survived both later mutates");
  assert.ok(final.reviews && final.reviews.items.length === 1, "reviews survived the gbp mutate");
  assert.ok(final.gbp && final.gbp.rows.length === 1, "gbp present");
  await clearLocalSignals("proj-atomic");
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

// ── D1: coverage parser + merge + resolve-over-seed + sample composition ─────
const TGT = (over = {}) => ({ area: "Praha", service: "Montáž klimatizací", monthlyVolume: 800, hasPage: false, rank: null, ...over });

test("parseHasPage: cs/en affirmatives → true, negatives/empty → false", () => {
  for (const v of ["ano", "yes", "true", "1", "má stránku", "hotovo"]) assert.equal(parseHasPage(v), true, v);
  for (const v of ["ne", "no", "false", "0", "chybí", "", undefined]) assert.equal(parseHasPage(v), false, String(v));
});

test("parseCoverageRows: header map (cs/en), hasPage coercion, dedup last-wins", () => {
  const rows = parseCoverageRows(
    [
      "služba,lokalita,má stránku",
      "Montáž klimatizací,Praha,ano",
      "montáž klimatizací,praha,ne", // same key (case) → last wins (false)
      "Servis a revize,Brno,yes",
      ",Praha,ano", // no service → dropped
    ].join("\n")
  );
  const byKey = Object.fromEntries(rows.map((r) => [`${r.service}|${r.locality}`.toLowerCase(), r.hasPage]));
  assert.equal(rows.length, 2);
  assert.equal(byKey["montáž klimatizací|praha"], false, "last write wins");
  assert.equal(byKey["servis a revize|brno"], true);
});

test("mergeCoverage: union upsert — a single toggle never drops the other rows", () => {
  const prev = parseCoverageRows(["Montáž klimatizací,Praha,ne", "Servis a revize,Brno,ano"].join("\n"));
  const merged = mergeCoverage(prev, [{ service: "Montáž klimatizací", locality: "Praha", hasPage: true }]);
  const byKey = Object.fromEntries(merged.map((r) => [`${r.service}|${r.locality}`, r.hasPage]));
  assert.equal(merged.length, 2, "the untouched Brno row survived");
  assert.equal(byKey["Montáž klimatizací|Praha"], true, "toggled cell updated");
  assert.equal(byKey["Servis a revize|Brno"], true);
});

test("resolveCoverage: seed byte-identical without import; live overlays page-presence", async () => {
  const seed = [TGT({ hasPage: true, rank: 4 }), TGT({ area: "Brno", hasPage: false, rank: null })];
  const before = await resolveCoverage("proj-cov", seed);
  assert.equal(before.live, false);
  assert.equal(before.targets, seed, "same array reference — untouched project byte-identical");

  await saveLocalSignals("proj-cov", {
    meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 0 },
    ladder: [],
    coverage: {
      meta: { source: "import", syncedAt: "2026-07-01T00:00:00Z", rowCount: 2 },
      rows: [
        { service: "Montáž klimatizací", locality: "Praha", hasPage: false }, // was true → now false
        { service: "Montáž klimatizací", locality: "Brno", hasPage: true }, // was false → now true
      ],
    },
  });
  const after = await resolveCoverage("proj-cov", seed);
  assert.equal(after.live, true);
  assert.equal(after.source, "import");
  const praha = after.targets.find((t) => t.area === "Praha");
  const brno = after.targets.find((t) => t.area === "Brno");
  assert.equal(praha.hasPage, false, "page removed");
  assert.equal(praha.rank, null, "no page → rank cleared");
  assert.equal(brno.hasPage, true, "page added");
  await clearLocalSignals("proj-cov");
});

test("profilesFromReviews: per-area count + weighted average rating", () => {
  const profiles = profilesFromReviews([
    { id: "1", author: "A", area: "Praha", rating: 5, text: "", daysAgo: 1 },
    { id: "2", author: "B", area: "Praha", rating: 3, text: "", daysAgo: 2 },
    { id: "3", author: "C", area: "Brno", rating: 4, text: "", daysAgo: 3 },
  ]);
  const byArea = Object.fromEntries(profiles.map((p) => [p.area, p]));
  assert.equal(byArea["Praha"].reviews, 2);
  assert.equal(byArea["Praha"].rating, 4); // (5+3)/2
  assert.equal(byArea["Brno"].reviews, 1);
  assert.equal(profiles[0].area, "Praha"); // highest count first
});

test("sample-flag composition: live coverage alone makes the diagnosis non-sample", () => {
  // Documents the honest composition: sample ⇔ NONE of ladder/reviews/coverage is live.
  const compose = (ladderLive, reviewsLive, coverageLive) => !ladderLive && !reviewsLive && !coverageLive;
  assert.equal(compose(false, false, false), true, "nothing live → sample");
  assert.equal(compose(false, false, true), false, "coverage live → not sample");
  assert.equal(compose(true, false, false), false);
  assert.equal(compose(false, true, false), false);
});
