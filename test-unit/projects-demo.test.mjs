/** The demo/real seam (src/lib/projects/demo.ts) — the discriminator that used to be
 *  re-derived inline as `id.startsWith("demo-")` at every call site (catalog
 *  persistence, warehouse badge, plan storage) and is now ONE resolver everything
 *  else derives from. That it is the only such site is pinned structurally by
 *  projects-demo-seam.test.mjs; this file pins the BEHAVIOUR, which must not change
 *  for either project kind. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_ID_PREFIX,
  asTenantProjectId,
  demoProjectId,
  isDemoProjectId,
  isDemoProject,
  projectRef,
  resolveProjectKind,
} from "@/lib/projects/demo";
import { DEMO_PROJECTS } from "@/lib/demo/projects";

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

test("resolveProjectKind: the typed property the predicates derive from", () => {
  assert.equal(resolveProjectKind("demo-eshop"), "demo");
  assert.equal(resolveProjectKind("proj_123"), "tenant");
  assert.equal(resolveProjectKind("mydemo-1"), "tenant");
  // An empty id is not a demo id — it is simply not persistable (see below).
  assert.equal(resolveProjectKind(""), "tenant");
});

test("projectRef: a discriminated identity, id included", () => {
  assert.deepEqual(projectRef("demo-app"), { kind: "demo", id: "demo-app" });
  assert.deepEqual(projectRef("proj_9"), { kind: "tenant", id: "proj_9" });
});

test("asTenantProjectId: the gate every persisting path goes through", () => {
  assert.equal(asTenantProjectId("proj_9"), "proj_9");
  assert.equal(asTenantProjectId("demo-eshop"), null, "a demo id never persists");
  assert.equal(asTenantProjectId(""), null, "an empty id never persists");
});

test("demoProjectId: the one minting site agrees with the one reader", () => {
  assert.equal(demoProjectId("eshop"), `${DEMO_ID_PREFIX}eshop`);
  assert.equal(isDemoProjectId(demoProjectId("anything")), true);
  // …and every shipped demo fixture still resolves as demo (no id was renamed).
  for (const p of DEMO_PROJECTS) {
    assert.equal(resolveProjectKind(p.id), "demo", `${p.id} must stay a demo id`);
    assert.equal(asTenantProjectId(p.id), null);
  }
});
