/** Unit tests for readableInkOn (src/lib/design-tokens-color.ts): the on-swatch
 *  ink picker must return theme-INDEPENDENT literals so a swatch painted from its
 *  parsed hex stays legible in both light and dark mode (ui-shell #1). A return of
 *  `var(--color-ink)` would flip to near-white in dark mode → white-on-light. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readableInkOn } from "@/lib/design-tokens-color";

test("readableInkOn returns only theme-independent literals (never a CSS var)", () => {
  for (const hex of ["#ffffff", "#000000", "#14b8b1", "#f4f7f9", "#0d1a24", "#e7eef5"]) {
    const ink = readableInkOn(hex);
    assert.ok(["#0d1a24", "#ffffff"].includes(ink), `${hex} → ${ink} must be a literal`);
    assert.ok(!ink.includes("var("), `${hex} → ${ink} must not be a CSS variable`);
  }
});

test("readableInkOn picks white ink on dark swatches, dark ink on light swatches", () => {
  assert.equal(readableInkOn("#0a0f16"), "#ffffff"); // near-black canvas
  assert.equal(readableInkOn("#f4f7f9"), "#0d1a24"); // near-white canvas
});

test("choice depends only on the passed hex, not on any ambient theme", () => {
  // The whole point of ui-shell #1: same hex in → same literal out, every time,
  // so the swatch (painted from that hex) and its ink can never disagree per theme.
  assert.equal(readableInkOn("#ffffff"), readableInkOn("#ffffff"));
  assert.notEqual(readableInkOn("#ffffff"), readableInkOn("#000000"));
});
