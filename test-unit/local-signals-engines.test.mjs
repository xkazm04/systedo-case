/** W1-C — the dual-engine local pack: Google (Maps / the local 3-pack) and Seznam
 *  (Mapy.cz / Firmy.cz) living in ONE `local_signals` blob.
 *
 *  The whole contract is additive, so half of this file is a byte-identity guard: a
 *  project that never imported a Seznam row must parse, merge, normalize and roll up
 *  EXACTLY as it did before, down to the absence of the `engine` key. The other half
 *  is the second engine actually working — its own ladder keys, its own pack
 *  uniqueness scope, and an import of one engine that does not wipe the other.
 *
 *  Pure: parsers + compute helpers only, no store I/O and no model calls. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  parseRanks,
  parseRankRows,
  parsePackRows,
  parseEngineCell,
  ladderKey,
  ladderFromRows,
  mergeLadder,
  mergePackRows,
  normalizeLadder,
} = await import("@/lib/local-signals/import");
const { LOCAL_ENGINES } = await import("@/lib/local-signals/types");
const {
  packsFromImported,
  enginesPresent,
  engineOf,
  ladderForEngine,
  packsForEngine,
  ENGINE_LABEL,
} = await import("@/lib/mappack/compute");

// ── the engine cell ──────────────────────────────────────────────────────────

test("parseEngineCell: cs/en spellings fold onto the two engines; absent ⇒ undefined", () => {
  assert.deepEqual(LOCAL_ENGINES, ["google", "seznam"]);
  for (const v of ["google", "GOOGLE", "Google Maps", "maps"]) {
    assert.equal(parseEngineCell(v), "google", `"${v}" is Google`);
  }
  for (const v of ["seznam", "Seznam.cz", "mapy", "Mapy.cz", "firmy", "Firmy.cz", " SEZNAM "]) {
    assert.equal(parseEngineCell(v), "seznam", `"${v}" is Seznam`);
  }
  // Absent / empty is not a value — it means "the export predates the column".
  assert.equal(parseEngineCell(undefined), undefined);
  assert.equal(parseEngineCell(""), undefined);
  assert.equal(parseEngineCell("   "), undefined);
  // Present but unrecognised is NEVER guessed onto an engine.
  assert.equal(parseEngineCell("bing"), null);
  assert.equal(parseEngineCell("seznamek"), null);
});

// ── ladder keys stay put for google ──────────────────────────────────────────

test("ladderKey: google keeps the historical keyword|area form; seznam is scoped", () => {
  assert.equal(ladderKey("zubař", "Praha"), "zubař|praha");
  // An explicit google engine must produce the SAME key — every stored id survives.
  assert.equal(ladderKey("zubař", "Praha", "google"), ladderKey("zubař", "Praha"));
  assert.equal(ladderKey("zubař", "Praha", "seznam"), "zubař|praha|seznam");
  assert.notEqual(ladderKey("zubař", "Praha", "seznam"), ladderKey("zubař", "Praha"));
});

// ── the ranks parser ─────────────────────────────────────────────────────────

test("parseRanks: a google row carries NO engine key (byte-identity with the old shape)", () => {
  assert.deepEqual(parseRankRows("zubař, Praha, 3"), [{ keyword: "zubař", area: "Praha", rank: 3 }]);
  // …and an explicit "google" cell is still not written onto the row.
  assert.deepEqual(parseRankRows("zubař, Praha, 3, google"), [
    { keyword: "zubař", area: "Praha", rank: 3 },
  ]);
});

test("parseRanks: the cs header names the engine column; both engines survive one file", () => {
  const { rows, errors } = parseRanks(
    [
      "klíčové slovo;oblast;pozice;vyhledávač",
      "zubař;Praha;3;google",
      "zubař;Praha;7;seznam",
      "implantáty;Brno;2;mapy.cz",
    ].join("\n")
  );
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3, "the same keyword×area on two engines is TWO rows");
  assert.equal(rows[0].engine, undefined, "google rows stay bare");
  assert.equal(rows[1].engine, "seznam");
  assert.equal(rows[2].engine, "seznam", "mapy.cz folds to seznam");
});

test("parseRanks: a missing engine column means google, and dedup stays per engine", () => {
  const { rows } = parseRanks("zubař,Praha,3\nzubař,Praha,5\nzubař,Praha,9,seznam");
  assert.equal(rows.length, 2, "last-write-wins per keyword×area×engine");
  assert.equal(rows[0].rank, 5, "the google row still deduped to the last one");
  assert.equal(rows[1].rank, 9);
  assert.equal(rows[1].engine, "seznam");
});

test("parseRanks: an unrecognised engine is reported by line and the row is dropped", () => {
  const { rows, errors } = parseRanks("zubař,Praha,3\nzubař,Praha,4,bing");
  assert.deepEqual(errors, [{ line: 2, code: "invalid-engine" }]);
  assert.equal(rows.length, 1, "the bad row never lands under a guessed engine");
  assert.equal(rows[0].engine, undefined);
  // The tolerant wrapper every existing caller uses still returns just the good rows.
  assert.deepEqual(parseRankRows("zubař,Praha,3\nzubař,Praha,4,bing"), rows);
});

// ── the ladder ───────────────────────────────────────────────────────────────

test("ladderFromRows: ids are engine-scoped and only a seznam row carries `engine`", () => {
  const [g, s] = ladderFromRows(
    [
      { keyword: "zubař", area: "Praha", rank: 3 },
      { keyword: "zubař", area: "Praha", rank: 7, engine: "seznam" },
    ],
    "2026-07-01T00:00:00.000Z"
  );
  assert.equal(g.id, "zubař|praha");
  assert.equal("engine" in g, false, "a google row must not gain the key");
  assert.equal(s.id, "zubař|praha|seznam");
  assert.equal(s.engine, "seznam");
});

test("mergeLadder: the two engines accumulate independent histories", () => {
  let ladder = mergeLadder(
    [],
    [
      { keyword: "zubař", area: "Praha", rank: 5 },
      { keyword: "zubař", area: "Praha", rank: 9, engine: "seznam" },
    ],
    "2026-06-01T00:00:00Z"
  );
  ladder = mergeLadder(
    ladder,
    [
      { keyword: "zubař", area: "Praha", rank: 3 },
      { keyword: "zubař", area: "Praha", rank: 8, engine: "seznam" },
    ],
    "2026-07-01T00:00:00Z"
  );
  assert.equal(ladder.length, 2);
  const g = ladder.find((r) => r.engine === undefined);
  const s = ladder.find((r) => r.engine === "seznam");
  assert.deepEqual(g.history.map((p) => p.rank), [5, 3]);
  assert.deepEqual(s.history.map((p) => p.rank), [9, 8]);
  assert.equal(g.current, 3);
  assert.equal(s.current, 8);
});

test("mergeLadder: a SEZNAM-only import never flags the google rows 'untracked'", () => {
  const base = mergeLadder([], [{ keyword: "zubař", area: "Praha", rank: 4 }], "2026-06-01T00:00:00Z");
  const after = mergeLadder(
    base,
    [{ keyword: "zubař", area: "Praha", rank: 9, engine: "seznam" }],
    "2026-07-01T00:00:00Z"
  );
  const g = after.find((r) => r.engine === undefined);
  assert.equal(g.untracked, false, "the Google ladder was not the subject of this import");
  assert.deepEqual(g.history.map((p) => p.rank), [4], "and its history is untouched");
  assert.equal(after.length, 2);
  // The retention rule still bites WITHIN an engine: a google subset re-import that
  // omits a google keyword flags it, exactly as before.
  const withTwo = mergeLadder(base, [{ keyword: "hygiena", area: "Praha", rank: 2 }], "2026-08-01T00:00:00Z");
  assert.equal(withTwo.find((r) => r.keyword === "zubař").untracked, true);
});

test("normalizeLadder: preserves a stored engine and NEVER writes one onto a legacy row", () => {
  const legacy = [{ id: "praha-zubar", keyword: "zubař", area: "Praha", history: [{ rank: 3, at: "2026-06-01" }] }];
  const [k] = normalizeLadder(legacy, "2026-07-01T00:00:00Z");
  assert.equal("engine" in k, false, "a legacy blob must round-trip without gaining the key");
  const [s] = normalizeLadder(
    [{ id: "x", keyword: "zubař", area: "Praha", engine: "seznam", history: [{ rank: 9, at: "2026-06-01" }] }],
    "2026-07-01T00:00:00Z"
  );
  assert.equal(s.engine, "seznam");
});

// ── the pack parser ──────────────────────────────────────────────────────────

test("parsePackRows: the engine column is optional and google rows stay bare", () => {
  const { rows, errors } = parsePackRows("Praha,Dentalis,1,4.7,128\nPraha,Rival,2,4.1,64,,,,google");
  assert.deepEqual(errors, []);
  assert.equal("engine" in rows[0], false);
  assert.equal("engine" in rows[1], false, "an explicit google is still not persisted");
});

test("parsePackRows: uniqueness of rank and name is scoped PER (area, engine)", () => {
  // Rank 1 in Praha on both engines is two observations, not a duplicate.
  const both = parsePackRows(
    [
      "oblast,název,pozice,hodnocení,recenze,vy,šířka,délka,vyhledávač",
      "Praha,Dentalis,1,4.7,128,ano,,,google",
      "Praha,Dentalis,1,4.7,128,ano,,,seznam",
    ].join("\n")
  );
  assert.deepEqual(both.errors, []);
  assert.equal(both.rows.length, 2);
  assert.equal(both.rows[1].engine, "seznam");
  // …but a repeat WITHIN one engine is still the hard rejection it always was.
  const dup = parsePackRows("Praha,A,1,4.7,10,,,,seznam\nPraha,B,1,4.2,20,,,,seznam");
  assert.deepEqual(dup.errors, [{ line: 2, code: "duplicate-rank" }]);
  const dupName = parsePackRows("Praha,A,1,4.7,10,,,,seznam\nPraha,a,2,4.2,20,,,,seznam");
  assert.deepEqual(dupName.errors, [{ line: 2, code: "duplicate-name" }]);
});

test("parsePackRows: an unknown engine rejects the row with invalid-engine (strict import)", () => {
  const { rows, errors } = parsePackRows("Praha,Dentalis,1,4.7,128,,,,bing");
  assert.deepEqual(errors, [{ line: 1, code: "invalid-engine" }]);
  assert.deepEqual(rows, [], "the strict pack importer persists nothing from a bad file");
});

// ── pack merge semantics ─────────────────────────────────────────────────────

const packRow = (area, name, rank, engine) => ({
  area,
  name,
  rank,
  rating: 4.5,
  reviews: 100,
  you: false,
  ...(engine ? { engine } : {}),
});

test("mergePackRows: a google-only import onto a google-only pack is the OLD replace", () => {
  const prev = [packRow("Praha", "Old", 1)];
  const next = [packRow("Praha", "New", 1)];
  const merged = mergePackRows(prev, next);
  assert.equal(merged, next, "same reference — the single-engine path does not even copy");
  assert.deepEqual(merged, next);
});

test("mergePackRows: importing one engine KEEPS the other engine's rows", () => {
  const prev = [packRow("Praha", "G1", 1), packRow("Praha", "S1", 1, "seznam")];
  const merged = mergePackRows(prev, [packRow("Praha", "G2", 1)]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((r) => r.name), ["S1", "G2"], "seznam retained, google replaced");
  // The mirror case: a seznam upload leaves the google pack alone.
  const back = mergePackRows(merged, [packRow("Praha", "S2", 1, "seznam")]);
  assert.deepEqual(back.map((r) => r.name), ["G2", "S2"]);
});

// ── the pure read helpers ────────────────────────────────────────────────────

test("engineOf / enginesPresent apply the legacy-read rule without inventing one", () => {
  assert.equal(engineOf({}), "google", "absent ⇒ google");
  assert.equal(engineOf({ engine: "seznam" }), "seznam");
  assert.deepEqual(enginesPresent([]), [], "no rows is NOT 'google only'");
  assert.deepEqual(enginesPresent([{}, {}]), ["google"]);
  assert.deepEqual(enginesPresent([{ engine: "seznam" }]), ["seznam"]);
  // Stable LOCAL_ENGINES order regardless of the order the rows arrived in.
  assert.deepEqual(enginesPresent([{ engine: "seznam" }, {}]), ["google", "seznam"]);
});

test("ladderForEngine / packsForEngine split a mixed set, legacy rows counting as google", () => {
  const rows = [
    { id: "a", keyword: "k", area: "Praha", current: 2, best: 2, history: [] },
    { id: "b", keyword: "k", area: "Praha", current: 9, best: 9, history: [], engine: "seznam" },
  ];
  assert.deepEqual(ladderForEngine(rows, "google").map((r) => r.id), ["a"]);
  assert.deepEqual(ladderForEngine(rows, "seznam").map((r) => r.id), ["b"]);
  const packs = [{ areaId: "praha", city: "Praha", listings: [] }, { areaId: "praha-seznam", city: "Praha", listings: [], engine: "seznam" }];
  assert.deepEqual(packsForEngine(packs, "google").map((p) => p.areaId), ["praha"]);
  assert.deepEqual(packsForEngine(packs, "seznam").map((p) => p.areaId), ["praha-seznam"]);
  assert.equal(ENGINE_LABEL.google, "Google Maps");
  assert.equal(ENGINE_LABEL.seznam, "Mapy.cz");
});

// ── the pack builder ─────────────────────────────────────────────────────────

test("packsFromImported: one area on two engines becomes TWO packs with distinct ids", () => {
  const packs = packsFromImported([
    packRow("Praha", "Dentalis", 1),
    packRow("Praha", "Rival", 2),
    packRow("Praha", "Dentalis", 3, "seznam"),
  ]);
  assert.equal(packs.length, 2);
  const [g, s] = packs;
  assert.equal(g.areaId, "praha", "the google id is unchanged");
  assert.equal("engine" in g, false, "and it is not stamped");
  assert.equal(s.areaId, "praha-seznam");
  assert.equal(s.engine, "seznam");
  assert.equal(s.city, "Praha", "both packs still name the same city");
  // Listing ids are derived from the areaId, so the two packs cannot collide.
  assert.deepEqual(g.listings.map((l) => l.id), ["praha-1", "praha-2"]);
  assert.deepEqual(s.listings.map((l) => l.id), ["praha-seznam-3"]);
});

test("packsFromImported: a google-only import is byte-identical to the pre-engine builder", () => {
  const packs = packsFromImported([packRow("Praha", "Dentalis", 1), packRow("Brno", "Rival", 1)], "Dentalis");
  assert.deepEqual(JSON.parse(JSON.stringify(packs)), [
    {
      areaId: "praha",
      city: "Praha",
      listings: [{ id: "praha-1", rank: 1, name: "Dentalis", you: true, rating: 4.5, reviews: 100 }],
    },
    {
      areaId: "brno",
      city: "Brno",
      listings: [{ id: "brno-1", rank: 1, name: "Rival", you: false, rating: 4.5, reviews: 100 }],
    },
  ]);
});
