/** E1 — the map pack's live-over-sample seam: the strict pack importer
 *  (parsePackRows), the pure builder (packsFromImported) and the resolver
 *  (resolvePacks) that picks imported rows over the seeded sample. Also locks the
 *  SAMPLE path byte-for-byte, since the whole point is that an unconfigured project
 *  keeps exactly the pack it had before. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-mappack-live-test.db");
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

const { parsePackRows } = await import("@/lib/local-signals/import");
const { packsFromImported } = await import("@/lib/mappack/compute");
const { packsForProject } = await import("@/lib/mappack/sample");
const { saveLocalSignals, clearLocalSignals, getLocalSignals } = await import(
  "@/lib/local-signals/store"
);
const { resolvePacks } = await import("@/lib/local-signals/resolve");

// ── the sample path must not move ────────────────────────────────────────────

/** The seeded pack for demo-local × (Praha, Brno), captured from the code BEFORE the
 *  live seam existed. Any drift here means an unconfigured project's map changed. */
const GOLDEN_SAMPLE = [
  {
    areaId: "praha",
    city: "Praha",
    center: { lat: 50.0755, lng: 14.4378 },
    listings: [
      { id: "praha-1", rank: 1, name: "Atelier Vega", you: false, rating: 4.9, reviews: 159, lat: 50.07039, lng: 14.42945 },
      { id: "praha-2", rank: 2, name: "Centrum Nova", you: false, rating: 4.5, reviews: 180, lat: 50.08113, lng: 14.44267 },
      { id: "praha-3", rank: 3, name: "Dentalis", you: true, rating: 4.4, reviews: 49, lat: 50.06775, lng: 14.43083 },
      { id: "praha-4", rank: 4, name: "Studio Alfa", you: false, rating: 4.8, reviews: 70, lat: 50.07697, lng: 14.44563 },
      { id: "praha-5", rank: 5, name: "Klinika Prima", you: false, rating: 4.9, reviews: 109, lat: 50.0822, lng: 14.43935 },
    ],
  },
  {
    areaId: "brno",
    city: "Brno",
    center: { lat: 49.1951, lng: 16.6068 },
    listings: [
      { id: "brno-1", rank: 1, name: "Expert Plus", you: false, rating: 4.3, reviews: 93, lat: 49.19277, lng: 16.59989 },
      { id: "brno-2", rank: 2, name: "Atelier Vega", you: false, rating: 4.9, reviews: 67, lat: 49.18446, lng: 16.60542 },
      { id: "brno-3", rank: 3, name: "Dentalis", you: true, rating: 4.3, reviews: 226, lat: 49.18824, lng: 16.59581 },
      { id: "brno-4", rank: 4, name: "Centrum Nova", you: false, rating: 4.8, reviews: 32, lat: 49.20028, lng: 16.59999 },
      { id: "brno-5", rank: 5, name: "Studio Alfa", you: false, rating: 4.7, reviews: 182, lat: 49.18752, lng: 16.60843 },
    ],
  },
];

const project = { id: "demo-local", type: "local" };
const localities = [
  { id: "praha", name: "Praha", region: "Praha" },
  { id: "brno", name: "Brno", region: "Jihomoravský" },
];
const sample = () => packsForProject(project, localities, "Dentalis");

test("sample pack is byte-identical to before the live seam (golden)", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(sample())), GOLDEN_SAMPLE);
});

// ── strict importer ──────────────────────────────────────────────────────────

test("parsePackRows: cs header in any order, quoted names, you flag, optional coords", () => {
  const { rows, errors } = parsePackRows(
    [
      "oblast;název;pozice;hodnocení;recenze;vy;šířka;délka",
      'Praha;"Dentalis, s.r.o.";1;4,7;128;ano;50.0755;14.4378',
      "Praha;Centrum Nova;2;4.5;180;ne;;",
      "Brno;Expert Plus;1;4.3;93;;;",
    ].join("\n")
  );
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, "Dentalis, s.r.o.");
  assert.equal(rows[0].rating, 4.7); // decimal comma accepted
  assert.equal(rows[0].you, true);
  assert.equal(rows[0].lat, 50.0755);
  // A row without coordinates keeps NO geo at all — never a fabricated pin.
  assert.equal(rows[1].lat, undefined);
  assert.equal(rows[1].lng, undefined);
  assert.equal(rows[1].you, false);
  assert.equal(rows[2].area, "Brno");
});

test("parsePackRows: headerless input assumes area, name, rank, rating, reviews", () => {
  const { rows, errors } = parsePackRows("Praha,Dentalis,1,4.7,128\nPraha,Rival,2,4.1,64");
  assert.deepEqual(errors, []);
  assert.deepEqual(rows.map((r) => r.name), ["Dentalis", "Rival"]);
  assert.equal(rows[1].reviews, 64);
});

test("parsePackRows: every malformed row is reported with its line and a code", () => {
  const cases = [
    [",Dentalis,1,4.7,128", "missing-area"],
    ["Praha,,1,4.7,128", "missing-name"],
    ["Praha,Dentalis,0,4.7,128", "bad-rank"],
    ["Praha,Dentalis,99,4.7,128", "bad-rank"],
    ["Praha,Dentalis,1.5,4.7,128", "bad-rank"],
    ["Praha,Dentalis,1,,128", "bad-rating"],
    ["Praha,Dentalis,1,7,128", "bad-rating"],
    ["Praha,Dentalis,1,4.7,", "bad-reviews"],
    ["Praha,Dentalis,1,4.7,128,,50.07,", "bad-coords"],
    ["Praha,Dentalis,1,4.7,128,,999,14.4", "bad-coords"],
  ];
  for (const [line, code] of cases) {
    const { rows, errors } = parsePackRows(line);
    assert.deepEqual(errors, [{ line: 1, code }], `expected ${code} for: ${line}`);
    assert.deepEqual(rows, [], `no row may survive a ${code} rejection`);
  }
});

test("parsePackRows: a position or a business cannot repeat within one area", () => {
  const dupRank = parsePackRows("Praha,A,1,4.7,10\nPraha,B,1,4.2,20");
  assert.deepEqual(dupRank.errors, [{ line: 2, code: "duplicate-rank" }]);
  const dupName = parsePackRows("Praha,Dentalis,1,4.7,10\nPraha,dentalis,2,4.2,20");
  assert.deepEqual(dupName.errors, [{ line: 2, code: "duplicate-name" }]);
  // …but the same rank in a DIFFERENT area is normal.
  const twoAreas = parsePackRows("Praha,A,1,4.7,10\nBrno,B,1,4.2,20");
  assert.deepEqual(twoAreas.errors, []);
  assert.equal(twoAreas.rows.length, 2);
});

test("parsePackRows: line numbers point at the real line, blanks skipped", () => {
  const { errors } = parsePackRows("oblast,název,pozice,hodnocení,recenze\n\nPraha,A,1,4.7,10\n\nPraha,B,0,4.2,20");
  assert.deepEqual(errors, [{ line: 5, code: "bad-rank" }]);
});

// ── pure builder ─────────────────────────────────────────────────────────────

const row = (area, name, rank, extra = {}) => ({
  area,
  name,
  rank,
  rating: 4.5,
  reviews: 100,
  you: false,
  ...extra,
});

test("packsFromImported groups by folded area, sorts by rank, averages the centre", () => {
  const packs = packsFromImported([
    row("Plzeň", "B", 2, { lat: 49.75, lng: 13.38 }),
    row("Plzen", "A", 1, { lat: 49.73, lng: 13.36 }),
    row("Brno", "C", 1),
  ]);
  assert.equal(packs.length, 2);
  const [plzen, brno] = packs;
  assert.equal(plzen.areaId, "plzen");
  assert.equal(plzen.city, "Plzeň"); // first-seen label, verbatim
  assert.deepEqual(plzen.listings.map((l) => l.rank), [1, 2]);
  assert.equal(plzen.listings[0].name, "A");
  assert.ok(Math.abs(plzen.center.lat - 49.74) < 1e-9);
  assert.ok(Math.abs(plzen.center.lng - 13.37) < 1e-9);
  // An area whose rows carry no coordinates gets NO centre and NO pins.
  assert.equal(brno.center, undefined);
  assert.equal(brno.listings[0].lat, undefined);
});

test("packsFromImported marks 'you' by name when the export carries no flag", () => {
  const packs = packsFromImported([row("Praha", "Rival", 1), row("Praha", "DENTALIS", 2)], "Dentalis");
  assert.deepEqual(packs[0].listings.map((l) => l.you), [false, true]);
});

test("packsFromImported prefers an explicit flag over a coincidental name match", () => {
  const packs = packsFromImported(
    [row("Praha", "Dentalis", 1), row("Praha", "Rival", 2, { you: true })],
    "Dentalis"
  );
  assert.deepEqual(packs[0].listings.map((l) => l.you), [false, true]);
});

test("packsFromImported on no rows yields no packs (never a half-invented one)", () => {
  assert.deepEqual(packsFromImported([]), []);
});

// ── resolver (store seam) ────────────────────────────────────────────────────

const meta = (rowCount) => ({ source: "import", syncedAt: "2026-07-20T09:00:00.000Z", rowCount });

test("resolvePacks: no imported section → the sample array BY IDENTITY, labelled sample", async () => {
  const pid = "proj-pack-none";
  await clearLocalSignals(pid);
  const s = sample();
  const resolved = await resolvePacks(pid, s, "Dentalis");
  assert.equal(resolved.packs, s); // same reference — the sample path is untouched
  assert.equal(resolved.live, false);
  assert.equal(resolved.source, "sample");
  assert.equal(resolved.syncedAt, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.packs)), GOLDEN_SAMPLE);
});

test("resolvePacks: an empty imported section falls back cleanly to the sample", async () => {
  const pid = "proj-pack-empty";
  await saveLocalSignals(pid, { meta: meta(0), ladder: [], pack: { meta: meta(0), rows: [] } });
  const s = sample();
  const resolved = await resolvePacks(pid, s, "Dentalis");
  assert.equal(resolved.packs, s);
  assert.equal(resolved.live, false);
});

test("resolvePacks: imported rows win and carry their provenance", async () => {
  const pid = "proj-pack-live";
  const rows = [
    { area: "Praha", name: "Dentalis", rank: 2, rating: 4.7, reviews: 128, you: true, lat: 50.08, lng: 14.44 },
    { area: "Praha", name: "Zubní Anděl", rank: 1, rating: 4.9, reviews: 402, you: false, lat: 50.09, lng: 14.42 },
  ];
  await saveLocalSignals(pid, {
    meta: meta(0),
    ladder: [],
    pack: { meta: { ...meta(2), sourceUrl: "https://example.test/pack.csv" }, rows },
  });

  const resolved = await resolvePacks(pid, sample(), "Dentalis");
  assert.equal(resolved.live, true);
  assert.equal(resolved.source, "import");
  assert.equal(resolved.syncedAt, "2026-07-20T09:00:00.000Z");
  assert.equal(resolved.sourceUrl, "https://example.test/pack.csv");
  // The live pack REPLACES the sample — no seeded Brno pack riding under a live label.
  assert.equal(resolved.packs.length, 1);
  assert.deepEqual(resolved.packs[0].listings.map((l) => l.name), ["Zubní Anděl", "Dentalis"]);
  assert.deepEqual(resolved.packs[0].listings.map((l) => l.you), [false, true]);
  // Not one hardcoded rival name survived into the live pack.
  const names = resolved.packs[0].listings.map((l) => l.name);
  for (const invented of ["Centrum Nova", "Studio Alfa", "Klinika Prima", "Rodinné centrum", "Expert Plus", "Atelier Vega"]) {
    assert.ok(!names.includes(invented));
  }
});

test("a pack import does not disturb the other live sections in the blob", async () => {
  const pid = "proj-pack-coexist";
  await saveLocalSignals(pid, {
    meta: meta(1),
    ladder: [{ id: "k|praha", keyword: "zubař", area: "Praha", history: [{ rank: 4, at: "2026-07-01" }], current: 4, best: 4 }],
    reviews: { meta: meta(1), items: [{ id: "r1", author: "Jana", area: "Praha", rating: 5, text: "ok", at: "2026-07-01" }] },
    pack: { meta: meta(1), rows: [{ area: "Praha", name: "Dentalis", rank: 1, rating: 4.7, reviews: 128, you: true }] },
  });
  const stored = await getLocalSignals(pid);
  assert.equal(stored.ladder.length, 1);
  assert.equal(stored.reviews.items.length, 1);
  assert.equal(stored.pack.rows.length, 1);
});
