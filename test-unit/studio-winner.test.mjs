/** crownWinner (src/lib/images/studio.ts) — the winner honesty fix. When vision
 *  scoring ran, the highest-scored candidate wins. When scoring was unavailable/
 *  degraded on the live path (every candidate score === null), the sort is a no-op tie
 *  and images[0] is ARBITRARY, not "ranked best" — so it's flagged scored:false +
 *  "bez vision skóre" so the UI + revenue attribution don't treat it as quality-ranked.
 *  Pure — no model / network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { crownWinner } = await import("@/lib/images/studio");

const img = (score) => ({
  buffer: Buffer.from(""),
  mime: "image/png",
  dataUrl: "",
  score,
  defects: "",
  winner: false,
  scored: score !== null,
});

test("crownWinner: with real scores, the highest score wins (and stays scored)", () => {
  const images = [img(6), img(9), img(3)];
  crownWinner(images);
  assert.equal(images[0].score, 9, "sorted desc");
  assert.equal(images[0].winner, true);
  assert.equal(images[0].scored, true);
  assert.equal(images[0].defects, "", "no degraded marker on a real rank");
});

test("crownWinner: all-null scores → winner marked scored:false + 'bez vision skóre'", () => {
  const images = [img(null), img(null), img(null)];
  crownWinner(images);
  assert.equal(images[0].winner, true, "still picks one so the flow has a winner");
  assert.equal(images[0].scored, false, "but it is NOT a quality rank");
  assert.equal(images[0].defects, "bez vision skóre");
  // the non-winners keep their honest (empty) defects — only the crowned pseudo-winner
  // needs the marker.
  assert.equal(images[1].winner, false);
});

test("crownWinner: existing defects on the winner are preserved (marker only fills a blank)", () => {
  const images = [{ ...img(null), defects: "rozmazané" }];
  crownWinner(images);
  assert.equal(images[0].defects, "rozmazané");
});

test("crownWinner: empty set is a no-op", () => {
  assert.doesNotThrow(() => crownWinner([]));
});
