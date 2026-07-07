/** Map-pack compute (src/lib/mappack/compute.ts) + seeded builders (sample.ts):
 *  share-of-voice, ladder trend, rank sort, geo + determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ladderDelta, shareOfVoice, sortByRank, sortLadder } from "@/lib/mappack/compute";
import { CITY_COORDS, keywordLadder, packForArea } from "@/lib/mappack/sample";

const listing = (rank, you = false) => ({
  id: `l${rank}`,
  rank,
  name: you ? "You" : `Rival ${rank}`,
  you,
  rating: 4.5,
  reviews: 100,
  lat: 50,
  lng: 14,
});

test("shareOfVoice sums to 1 and ranks #1 highest", () => {
  const rows = shareOfVoice([listing(1, true), listing(2), listing(3), listing(4), listing(5)]);
  const sum = rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(rows[0].you, true);
  assert.ok(rows[0].share > rows[1].share);
  assert.ok(rows[1].share > rows[4].share);
});

test("shareOfVoice on empty pack does not divide by zero", () => {
  assert.deepEqual(shareOfVoice([]), []);
});

test("sortByRank orders 1-first and does not mutate", () => {
  const input = [listing(3), listing(1), listing(2)];
  const sorted = sortByRank(input);
  assert.deepEqual(sorted.map((l) => l.rank), [1, 2, 3]);
  assert.deepEqual(input.map((l) => l.rank), [3, 1, 2]);
});

test("ladderDelta is positive when the rank improved (oldest−newest)", () => {
  assert.equal(ladderDelta({ history: [8, 6, 4, 2] }), 6); // climbed 8 → 2
  assert.equal(ladderDelta({ history: [2, 4] }), -2); // slipped
  assert.equal(ladderDelta({ history: [3] }), 0);
});

test("sortLadder puts the best current position first", () => {
  const rows = [
    { id: "a", keyword: "a", area: "Praha", history: [9, 5], current: 5, best: 5 },
    { id: "b", keyword: "b", area: "Brno", history: [4, 1], current: 1, best: 1 },
  ];
  assert.deepEqual(sortLadder(rows).map((r) => r.id), ["b", "a"]);
});

test("packForArea is deterministic, ranks 1–5, exactly one 'you', geo near the city", () => {
  const project = { id: "demo-local", type: "local" };
  const praha = { id: "praha", name: "Praha", region: "Praha" };
  const a = packForArea(project, praha, "Dentalis");
  const b = packForArea(project, praha, "Dentalis");
  assert.deepEqual(a, b);
  assert.deepEqual(a.listings.map((l) => l.rank), [1, 2, 3, 4, 5]);
  assert.equal(a.listings.filter((l) => l.you).length, 1);
  assert.equal(a.listings.find((l) => l.you).name, "Dentalis");
  // every pin sits within ~2km of the Praha centre
  for (const l of a.listings) {
    assert.ok(Math.abs(l.lat - CITY_COORDS.praha.lat) < 0.02);
    assert.ok(Math.abs(l.lng - CITY_COORDS.praha.lng) < 0.02);
  }
});

test("keywordLadder builds capped, history-bounded rows", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [{ id: "praha", name: "Praha", region: "Praha" }];
  const services = [
    { id: "s1", name: "Sluzba A", serviceAreas: ["praha"] },
    { id: "s2", name: "Sluzba B", serviceAreas: ["praha"] },
  ];
  const rows = keywordLadder(project, localities, services, 6);
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.history.length, 8);
    assert.equal(r.current, r.history[r.history.length - 1]);
    assert.equal(r.best, Math.min(...r.history));
    for (const p of r.history) assert.ok(p >= 1);
  }
  // cap is honoured
  assert.equal(keywordLadder(project, localities, [services[0], services[1]], 1).length, 1);
});
