/** ADR-0013: where a pathname sits in the area tree. The sidebar's active lamp,
 *  its roof row and its active room all read this one answer, so a wrong answer
 *  here is a sidebar that highlights the wrong place. Pure. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { navLocation } = await import("@/lib/projects/nav-location");
const { moduleHref, areaHref } = await import("@/lib/projects/modules");

const B = "/app/p1";

test("the project root is the Home roof", () => {
  const loc = navLocation(B, B);
  assert.equal(loc.area, "home");
  assert.equal(loc.isRoof, true);
  assert.equal(loc.module?.key, "");
});

test("a roof that is a module (Výkon) is the Performance roof", () => {
  const loc = navLocation(`${B}/performance`, B);
  assert.equal(loc.area, "performance");
  assert.equal(loc.isRoof, true);
  assert.equal(loc.module?.key, "vykon");
});

test("a sub-route of a roof module is not the roof (the longest segment wins)", () => {
  const loc = navLocation(`${B}/performance/report`, B);
  assert.equal(loc.area, "performance");
  assert.equal(loc.isRoof, false);
});

test("a room resolves to its module and area, including its own sub-paths", () => {
  for (const path of [`${B}/reach/kampane`, `${B}/reach/kampane/detail/42`]) {
    const loc = navLocation(path, B);
    assert.equal(loc.area, "reach");
    assert.equal(loc.module?.key, "kampane");
    assert.equal(loc.isRoof, false);
  }
});

test("a roof that is not a module resolves to its area with no module", () => {
  const loc = navLocation(`${B}/local`, B);
  assert.deepEqual([loc.area, loc.module, loc.isRoof], ["local", null, true]);
});

test("settings and home modules stay flat", () => {
  assert.equal(navLocation(`${B}/ucet`, B).area, "settings");
  assert.equal(navLocation(`${B}/start`, B).area, "home");
  assert.equal(moduleHref("p1", "ucet"), `${B}/ucet`);
  assert.equal(moduleHref("p1", "kanaly"), `${B}/channels/kanaly`);
  assert.equal(areaHref("p1", "home"), B);
});

test("an unknown path falls back to Home without claiming a roof", () => {
  const loc = navLocation(`${B}/nonexistent`, B);
  assert.deepEqual([loc.area, loc.isRoof], ["home", false]);
});
