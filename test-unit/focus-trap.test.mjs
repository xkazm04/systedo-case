/** Focus-trap tab-target math (src/lib/a11y/focusTrap.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { focusTrapWrapIndex, FOCUSABLE_SELECTOR } from "@/lib/a11y/focusTrap";

test("empty trap never intervenes", () => {
  assert.equal(focusTrapWrapIndex(0, -1, false), null);
  assert.equal(focusTrapWrapIndex(0, 0, true), null);
});

test("focus outside the list lands on first (Tab) / last (Shift+Tab)", () => {
  assert.equal(focusTrapWrapIndex(3, -1, false), 0);
  assert.equal(focusTrapWrapIndex(3, -1, true), 2);
});

test("Tab on the last element wraps to the first", () => {
  assert.equal(focusTrapWrapIndex(3, 2, false), 0);
});

test("Shift+Tab on the first element wraps to the last", () => {
  assert.equal(focusTrapWrapIndex(3, 0, true), 2);
});

test("middle-of-list Tab defers to native order (null)", () => {
  assert.equal(focusTrapWrapIndex(3, 1, false), null);
  assert.equal(focusTrapWrapIndex(3, 1, true), null);
});

test("single focusable element (e.g. a palette input) always re-wraps to itself", () => {
  assert.equal(focusTrapWrapIndex(1, 0, false), 0);
  assert.equal(focusTrapWrapIndex(1, 0, true), 0);
});

test("selector excludes tabindex=-1 and disabled controls", () => {
  assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
  assert.match(FOCUSABLE_SELECTOR, /tabindex="-1"/);
});
