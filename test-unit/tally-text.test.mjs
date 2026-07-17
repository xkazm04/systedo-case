/** Tally count-up rendering (src/lib/motion.ts tallyText): a `format` callback
 *  routes the animated value through the app's locale-aware chokepoint; without
 *  one it falls back to the legacy bare toFixed/round. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyText } from "@/lib/motion";

test("no options → rounds to an integer string", () => {
  assert.equal(tallyText(1248590.6), "1248591");
  assert.equal(tallyText(0.4), "0");
});

test("decimals → fixed decimal places (legacy behaviour)", () => {
  assert.equal(tallyText(4.199, { decimals: 1 }), "4.2");
  assert.equal(tallyText(3, { decimals: 2 }), "3.00");
});

test("format callback takes precedence over decimals", () => {
  const fmt = (n) => `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
  assert.equal(tallyText(1248590, { format: fmt, decimals: 2 }), fmt(1248590));
});

test("format callback is applied to the exact value passed", () => {
  const seen = [];
  tallyText(42.5, { format: (n) => (seen.push(n), "x") });
  assert.deepEqual(seen, [42.5]);
});
