/** Review-inbox compute (src/lib/reviews/compute.ts) + the seeded generator
 *  (sample.ts): sentiment band, filter, sort, rollup, macro expansion, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandOf,
  expandMacro,
  filterReviews,
  sentiment,
  sortReviews,
} from "@/lib/reviews/compute";
import { reviewsForProject } from "@/lib/reviews/sample";

const rev = (over = {}) => ({
  id: "r",
  author: "Jana K.",
  area: "Praha",
  rating: 5,
  text: "Skvělé služby",
  daysAgo: 2,
  ...over,
});

test("bandOf splits 4–5 / 3 / 1–2", () => {
  assert.equal(bandOf(5), "positive");
  assert.equal(bandOf(4), "positive");
  assert.equal(bandOf(3), "neutral");
  assert.equal(bandOf(2), "negative");
  assert.equal(bandOf(1), "negative");
});

test("filterReviews narrows by band, area, status and query", () => {
  const items = [
    rev({ id: "a", rating: 5, area: "Praha", answered: true }),
    rev({ id: "b", rating: 2, area: "Brno", text: "zpoždění", flagged: true }),
    rev({ id: "c", rating: 3, area: "Praha", author: "Petr M." }),
  ];
  const base = { query: "", band: "all", area: "all", status: "all" };
  assert.deepEqual(filterReviews(items, { ...base, band: "negative" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterReviews(items, { ...base, area: "Praha" }).map((r) => r.id), ["a", "c"]);
  assert.deepEqual(filterReviews(items, { ...base, status: "unanswered" }).map((r) => r.id), ["b", "c"]);
  assert.deepEqual(filterReviews(items, { ...base, status: "flagged" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterReviews(items, { ...base, query: "petr" }).map((r) => r.id), ["c"]);
  assert.deepEqual(filterReviews(items, { ...base, query: "zpožd" }).map((r) => r.id), ["b"]);
});

test("sortReviews orders by recency and rating", () => {
  const items = [rev({ id: "a", daysAgo: 5, rating: 3 }), rev({ id: "b", daysAgo: 1, rating: 5 })];
  assert.deepEqual(sortReviews(items, "newest").map((r) => r.id), ["b", "a"]);
  assert.deepEqual(sortReviews(items, "oldest").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(sortReviews(items, "rating-asc").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(sortReviews(items, "rating-desc").map((r) => r.id), ["b", "a"]);
});

test("sentiment rolls up counts, average and unanswered", () => {
  const s = sentiment([
    rev({ rating: 5, answered: true }),
    rev({ rating: 3 }),
    rev({ rating: 1 }),
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.positive, 1);
  assert.equal(s.neutral, 1);
  assert.equal(s.negative, 1);
  assert.equal(s.avg, 3);
  assert.equal(s.unanswered, 2);
  assert.equal(sentiment([]).avg, 0);
});

test("expandMacro fills author/business/area and leaves unknowns intact", () => {
  assert.equal(
    expandMacro("Dobrý den {author}, děkujeme za návštěvu {business} v {area}.", {
      author: "Jana K.",
      business: "Dentalis",
      area: "Praha",
    }),
    "Dobrý den Jana K., děkujeme za návštěvu Dentalis v Praha."
  );
  assert.equal(expandMacro("Ahoj {author} {unknown}", { author: "Petr" }), "Ahoj Petr {unknown}");
});

test("reviewsForProject is deterministic, newest-first and locality-scoped", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [
    { id: "praha", name: "Praha", region: "Praha" },
    { id: "brno", name: "Brno", region: "JMK" },
  ];
  const a = reviewsForProject(project, localities, 18);
  const b = reviewsForProject(project, localities, 18);
  assert.deepEqual(a, b);
  assert.equal(a.length, 18);
  // sorted newest-first (non-decreasing daysAgo)
  for (let i = 1; i < a.length; i++) assert.ok(a[i].daysAgo >= a[i - 1].daysAgo);
  // every review lands in one of the project's localities, rating in 1..5
  const names = new Set(localities.map((l) => l.name));
  for (const r of a) {
    assert.ok(names.has(r.area));
    assert.ok(r.rating >= 1 && r.rating <= 5);
  }
});
