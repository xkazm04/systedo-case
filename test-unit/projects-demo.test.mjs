/** The reserved demo id namespace predicate (src/lib/projects/demo.ts) — the demo/real
 *  discriminator that used to be re-derived inline as `id.startsWith("demo-")` at every
 *  call site (catalog persistence, warehouse badge, plan storage). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_ID_PREFIX, isDemoProjectId, isDemoProject } from "@/lib/projects/demo";

test("isDemoProjectId: only the reserved demo- prefix is a demo id", () => {
  assert.equal(DEMO_ID_PREFIX, "demo-");
  assert.equal(isDemoProjectId("demo-local"), true);
  assert.equal(isDemoProjectId("demo-eshop"), true);
  assert.equal(isDemoProjectId("proj_123"), false);
  assert.equal(isDemoProjectId("mydemo-1"), false); // prefix, not substring
  assert.equal(isDemoProjectId(""), false);
});

test("isDemoProject: reads the id off a project record", () => {
  assert.equal(isDemoProject({ id: "demo-local" }), true);
  assert.equal(isDemoProject({ id: "proj_abc" }), false);
});
