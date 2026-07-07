/** Location-roster compute (src/lib/locations/compute.ts) + the catalog-grounded
 *  seed builder (sample.ts): summary rollups, attention ranking, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attentionScore,
  fleetSummary,
  needsAttention,
  sortByAttention,
} from "@/lib/locations/compute";
import { locationsFromCatalog } from "@/lib/locations/sample";

const row = (over = {}) => ({
  id: "praha",
  name: "Praha",
  region: "Praha",
  services: 3,
  gbp: "connected",
  autopilot: true,
  rating: 4.6,
  reviews: 100,
  unanswered: 0,
  mapRank: 3,
  openTasks: 0,
  flagged: 0,
  drafts: 0,
  monthlyBudget: 10000,
  ...over,
});

test("needsAttention flags disconnected / flagged / weak-rank / review backlog", () => {
  assert.equal(needsAttention(row()), false);
  assert.equal(needsAttention(row({ gbp: "attention" })), true);
  assert.equal(needsAttention(row({ gbp: "disconnected" })), true);
  assert.equal(needsAttention(row({ flagged: 1 })), true);
  assert.equal(needsAttention(row({ mapRank: 11 })), true);
  assert.equal(needsAttention(row({ unanswered: 3 })), true);
  // a small unanswered backlog (≤2) alone is not attention-worthy
  assert.equal(needsAttention(row({ unanswered: 2 })), false);
});

test("fleetSummary aggregates counts and a review-weighted rating", () => {
  const rows = [
    row({ reviews: 100, rating: 5, autopilot: true }),
    row({ id: "brno", reviews: 100, rating: 4, autopilot: false, gbp: "disconnected", unanswered: 4, drafts: 2 }),
  ];
  const s = fleetSummary(rows);
  assert.equal(s.total, 2);
  assert.equal(s.onAutopilot, 1);
  assert.equal(s.needsAttention, 1);
  assert.equal(s.unanswered, 4);
  assert.equal(s.drafts, 2);
  assert.equal(s.totalReviews, 200);
  assert.equal(s.avgRating, 4.5); // (5*100 + 4*100) / 200
});

test("fleetSummary avgRating is 0 with no reviews (no divide-by-zero)", () => {
  assert.equal(fleetSummary([row({ reviews: 0 })]).avgRating, 0);
  assert.equal(fleetSummary([]).avgRating, 0);
});

test("attentionScore ranks disconnected above attention above clean", () => {
  assert.ok(attentionScore(row({ gbp: "disconnected" })) > attentionScore(row({ gbp: "attention" })));
  assert.ok(attentionScore(row({ gbp: "attention" })) > attentionScore(row({ gbp: "connected" })));
});

test("sortByAttention is most-urgent-first, stable, and non-mutating", () => {
  const rows = [
    row({ id: "a", gbp: "connected" }),
    row({ id: "b", gbp: "disconnected" }),
    row({ id: "c", gbp: "attention" }),
  ];
  const sorted = sortByAttention(rows);
  assert.deepEqual(sorted.map((r) => r.id), ["b", "c", "a"]);
  // input not mutated
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c"]);
});

test("locationsFromCatalog is deterministic and counts covering services", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [
    { id: "praha", name: "Praha", region: "Praha" },
    { id: "brno", name: "Brno", region: "JMK" },
  ];
  const services = [
    { serviceAreas: ["praha", "brno"] },
    { serviceAreas: ["praha"] },
  ];
  const a = locationsFromCatalog(project, localities, services);
  const b = locationsFromCatalog(project, localities, services);
  assert.deepEqual(a, b); // stable across calls
  assert.equal(a.length, 2);
  assert.equal(a[0].services, 2); // praha covered by both
  assert.equal(a[1].services, 1); // brno covered by one
  // ratings sit in the modelled 4.2–4.95 band
  for (const r of a) assert.ok(r.rating >= 4.2 && r.rating <= 4.95);
});
