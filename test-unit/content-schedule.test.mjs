/** Content-schedule compute (src/lib/content-schedule/compute.ts) + seeded board
 *  (sample.ts): status rollup, idea queue, calendar layout, next-free-day, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarGrid, ideas, nextFreeDay, statusCounts } from "@/lib/content-schedule/compute";
import { initialPosts, WINDOW_DAYS } from "@/lib/content-schedule/sample";

const post = (over = {}) => ({
  id: "p",
  title: "Nabídka",
  service: "Sluzba",
  area: "Praha",
  status: "scheduled",
  day: 0,
  ...over,
});

test("statusCounts tallies the three states", () => {
  const c = statusCounts([
    post({ status: "idea", day: null }),
    post({ status: "scheduled", day: 3 }),
    post({ status: "published", day: 1 }),
    post({ status: "idea", day: null }),
  ]);
  assert.deepEqual(c, { idea: 2, scheduled: 1, published: 1 });
});

test("ideas returns only unscheduled posts", () => {
  const posts = [post({ id: "a", status: "idea", day: null }), post({ id: "b", status: "scheduled", day: 2 })];
  assert.deepEqual(ideas(posts).map((p) => p.id), ["a"]);
});

test("calendarGrid has 28 cells and places posts by day; ideas excluded", () => {
  const grid = calendarGrid([
    post({ id: "a", day: 0 }),
    post({ id: "b", day: 0 }),
    post({ id: "c", day: 5 }),
    post({ id: "d", status: "idea", day: null }),
  ]);
  assert.equal(grid.length, WINDOW_DAYS);
  assert.deepEqual(grid[0].map((p) => p.id), ["a", "b"]);
  assert.deepEqual(grid[5].map((p) => p.id), ["c"]);
  assert.equal(grid.flat().length, 3); // idea 'd' excluded
});

test("nextFreeDay finds the first under-capacity day", () => {
  // day 0 full (2), day 1 has 1 → next free is day 1
  const posts = [post({ id: "a", day: 0 }), post({ id: "b", day: 0 }), post({ id: "c", day: 1 })];
  assert.equal(nextFreeDay(posts, 2), 1);
  // empty board → day 0
  assert.equal(nextFreeDay([], 2), 0);
});

test("initialPosts is deterministic and catalog-grounded", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [{ id: "praha", name: "Praha", region: "Praha" }];
  const services = [
    { id: "s1", name: "Sluzba A", serviceAreas: ["praha"] },
    { id: "s2", name: "Sluzba B", serviceAreas: ["praha"] },
  ];
  const a = initialPosts(project, services, localities);
  const b = initialPosts(project, services, localities);
  assert.deepEqual(a, b);
  assert.equal(a.length, 2);
  for (const p of a) {
    assert.ok(["idea", "scheduled", "published"].includes(p.status));
    if (p.status === "idea") assert.equal(p.day, null);
    else assert.ok(p.day >= 0 && p.day < WINDOW_DAYS);
    assert.ok(p.title.includes(p.service) || p.title.includes(p.area));
  }
});
