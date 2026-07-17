/** Per-project social brand key (src/lib/social/brand-storage.ts). The bug was ONE
 *  global key shared across every project, bleeding project A's brand into B; the key
 *  must now be project-scoped, falling back to the legacy global key only when no
 *  project id is available. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { socialBrandKey } from "@/lib/social/brand-storage";

test("socialBrandKey: scoped per project, distinct across projects", () => {
  assert.equal(socialBrandKey("proj-a"), "app:social-brand:proj-a");
  assert.equal(socialBrandKey("proj-b"), "app:social-brand:proj-b");
  assert.notEqual(socialBrandKey("proj-a"), socialBrandKey("proj-b"));
});

test("socialBrandKey: falls back to the legacy global key with no project id", () => {
  assert.equal(socialBrandKey(), "app:social-brand");
  assert.equal(socialBrandKey(undefined), "app:social-brand");
});
