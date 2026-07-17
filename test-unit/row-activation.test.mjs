/** Accessible table-row activation (src/lib/a11y/rowActivation.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRowActivationKey, interactiveRowProps } from "@/lib/a11y/rowActivation";

test("Enter and Space activate; other keys don't", () => {
  assert.equal(isRowActivationKey("Enter"), true);
  assert.equal(isRowActivationKey(" "), true);
  assert.equal(isRowActivationKey("Spacebar"), true);
  assert.equal(isRowActivationKey("a"), false);
  assert.equal(isRowActivationKey("Tab"), false);
  assert.equal(isRowActivationKey("ArrowDown"), false);
});

test("interactiveRowProps exposes button semantics + a Tab stop", () => {
  const p = interactiveRowProps(() => {}, "Open X");
  assert.equal(p.role, "button");
  assert.equal(p.tabIndex, 0);
  assert.equal(p["aria-label"], "Open X");
});

test("onKeyDown fires the action on Enter/Space and preventDefault on Space", () => {
  let fired = 0;
  const p = interactiveRowProps(() => fired++, "Open X");
  let prevented = 0;
  const ev = (key) => ({ key, preventDefault: () => prevented++ });

  p.onKeyDown(ev("Enter"));
  p.onKeyDown(ev(" "));
  p.onKeyDown(ev("Tab"));

  assert.equal(fired, 2);
  assert.equal(prevented, 2);
});
