/** Branding compute (src/lib/branding/compute.ts): hex validation, contrast pick,
 *  initials fallback. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENT_PALETTE, initials, isHexColor, luminance, readableOn } from "@/lib/branding/compute";

test("isHexColor accepts #rrggbb only", () => {
  assert.ok(isHexColor("#0891b2"));
  assert.ok(isHexColor("#FFFFFF"));
  assert.ok(!isHexColor("0891b2"));
  assert.ok(!isHexColor("#fff"));
  assert.ok(!isHexColor("#12345g"));
});

test("readableOn: dark text on light accents, white text on dark accents", () => {
  assert.equal(readableOn("#ffffff"), "#111111");
  assert.equal(readableOn("#f59e0b"), "#111111");
  assert.equal(readableOn("#000000"), "#ffffff");
  assert.equal(readableOn("#0891b2"), "#ffffff");
});

test("luminance returns 0 for malformed input", () => {
  assert.equal(luminance("nope"), 0);
  assert.ok(luminance("#ffffff") > 0.9);
});

test("initials derives 1-2 uppercase letters", () => {
  assert.equal(initials("Dentalis"), "DE");
  assert.equal(initials("Praha Dental Clinic"), "PC");
  assert.equal(initials("  "), "?");
});

test("ACCENT_PALETTE is all valid hex", () => {
  for (const c of ACCENT_PALETTE) assert.ok(isHexColor(c), c);
});
