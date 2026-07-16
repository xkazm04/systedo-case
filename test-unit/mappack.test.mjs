/** Map-pack compute (src/lib/mappack/compute.ts) + seeded builders (sample.ts):
 *  share-of-voice, ladder trend, rank sort, geo + determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeSinceLast,
  ladderDelta,
  ladderSpanDays,
  observedSpanDays,
  rankDecline,
  shareOfVoice,
  sortByRank,
  sortLadder,
} from "@/lib/mappack/compute";
import { CITY_COORDS, keywordLadder, packForArea } from "@/lib/mappack/sample";

/** Build a dated history from bare ranks, newest last, `stepDays` apart. */
const hist = (ranks, stepDays = 10, end = Date.parse("2026-06-30")) =>
  ranks.map((rank, i) => ({
    rank,
    at: new Date(end - (ranks.length - 1 - i) * stepDays * 86_400_000).toISOString().slice(0, 10),
  }));

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
  assert.equal(ladderDelta({ history: hist([8, 6, 4, 2]) }), 6); // climbed 8 → 2
  assert.equal(ladderDelta({ history: hist([2, 4]) }), -2); // slipped
  assert.equal(ladderDelta({ history: hist([3]) }), 0);
});

test("changeSinceLast is the move between the last two observations, null when <2", () => {
  assert.equal(changeSinceLast({ history: hist([8, 6, 4, 2]) }), 2); // 4 → 2 improved
  assert.equal(changeSinceLast({ history: hist([2, 5]) }), -3); // slipped
  assert.equal(changeSinceLast({ history: hist([3]) }), null);
});

test("observedSpanDays + ladderSpanDays reflect the real dated window", () => {
  assert.equal(observedSpanDays({ history: hist([9, 5, 3], 10) }), 20); // 2 gaps × 10d
  assert.equal(observedSpanDays({ history: hist([4], 10) }), 0); // single point
  const rows = [{ history: hist([9, 5], 5) }, { history: hist([9, 7, 3], 10) }];
  assert.equal(ladderSpanDays(rows), 20); // widest window wins
});

test("rankDecline: fires on ≥3 consecutive worsening imports past the magnitude bar", () => {
  const d = rankDecline({ history: hist([3, 4, 6, 9]) }); // worsened 3 imports in a row
  assert.ok(d, "sustained worsening run detected");
  assert.equal(d.run, 3);
  assert.equal(d.droppedBy, 6); // 9 − 3
});

test("rankDecline: sparse history (too few points for a full run) does NOT fire", () => {
  assert.equal(rankDecline({ history: hist([3, 6, 9]) }), null); // only 2 moves < minRun
  assert.equal(rankDecline({ history: hist([9]) }), null);
});

test("rankDecline: a recovering (improving) series does NOT fire", () => {
  assert.equal(rankDecline({ history: hist([9, 7, 5, 3]) }), null); // ranks improving
  // A run that recovers at the very end breaks (run must reach the latest point).
  assert.equal(rankDecline({ history: hist([3, 5, 7, 6]) }), null);
});

test("sortLadder puts the best current position first", () => {
  const rows = [
    { id: "a", keyword: "a", area: "Praha", history: hist([9, 5]), current: 5, best: 5 },
    { id: "b", keyword: "b", area: "Brno", history: hist([4, 1]), current: 1, best: 1 },
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
  const rows = keywordLadder(project, localities, services, 6, new Date("2026-06-30"));
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.history.length, 8);
    assert.equal(r.current, r.history[r.history.length - 1].rank);
    assert.equal(r.best, Math.min(...r.history.map((p) => p.rank)));
    for (const p of r.history) {
      assert.ok(p.rank >= 1);
      assert.match(p.at, /^\d{4}-\d{2}-\d{2}$/); // every point is date-stamped
    }
    // newest point anchored at the passed endDate; span is the sampled 90-day window
    assert.equal(r.history[r.history.length - 1].at, "2026-06-30");
    assert.equal(observedSpanDays(r), 90);
  }
  // cap is honoured
  assert.equal(keywordLadder(project, localities, [services[0], services[1]], 1).length, 1);
});
