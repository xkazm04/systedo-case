/** The squarified treemap layout (segments/treemap.ts): the geometry the segment
 *  map's source tiles are drawn from. Pure, so it is checked here rather than
 *  eyeballed in a browser — a tile whose area does not match its number is a chart
 *  that lies. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { squarify } = await import("@/components/app/modules/leads/segments/treemap");

const W = 100;
const H = 100;

function items(...values) {
  return values.map((v, i) => ({ key: `s${i}`, value: v }));
}

test("every tile's AREA is proportional to its value, and the tiles fill the box", () => {
  const values = [300, 150, 121, 91, 88, 64, 39];
  const rects = squarify(items(...values), W, H);
  assert.equal(rects.length, values.length);

  const total = values.reduce((a, b) => a + b, 0);
  let area = 0;
  for (const r of rects) {
    const expected = (r.value / total) * W * H;
    assert.ok(Math.abs(r.w * r.h - expected) < 0.5, `${r.key}: area ${r.w * r.h} vs ${expected}`);
    area += r.w * r.h;
  }
  assert.ok(Math.abs(area - W * H) < 1, "the whole rectangle is used");
});

test("no tile escapes the box", () => {
  for (const r of squarify(items(5, 4, 3, 2, 1, 1, 1), W, H)) {
    assert.ok(r.x >= -0.001 && r.y >= -0.001, `${r.key} starts inside`);
    assert.ok(r.x + r.w <= W + 0.001 && r.y + r.h <= H + 0.001, `${r.key} ends inside`);
    assert.ok(r.w > 0 && r.h > 0, `${r.key} has a drawable size`);
  }
});

test("tiles are SQUARISH — the point of squarifying, not just of tiling", () => {
  const rects = squarify(items(6, 6, 4, 3, 2, 2, 1), W, H);
  const worst = Math.max(...rects.map((r) => Math.max(r.w / r.h, r.h / r.w)));
  assert.ok(worst < 5, `worst aspect ratio ${worst} should stay readable`);
  // A naive slice-and-dice of the same set produces ~14:1 slivers, so this bound
  // is what the algorithm buys.
});

test("biggest first — the layout order is deterministic, ties broken by key", () => {
  const rects = squarify(
    [
      { key: "b", value: 10 },
      { key: "a", value: 10 },
      { key: "c", value: 30 },
    ],
    W,
    H
  );
  assert.deepEqual(rects.map((r) => r.key), ["c", "a", "b"]);
});

test("nothing to draw is an empty layout, never a zero-area tile", () => {
  assert.deepEqual(squarify([], W, H), []);
  assert.deepEqual(squarify(items(0, -3), W, H), []);
  assert.deepEqual(squarify(items(1, 2), 0, H), []);
  const mixed = squarify([{ key: "a", value: 5 }, { key: "z", value: 0 }], W, H);
  assert.deepEqual(mixed.map((r) => r.key), ["a"], "a zero-count source is dropped, not drawn");
});
