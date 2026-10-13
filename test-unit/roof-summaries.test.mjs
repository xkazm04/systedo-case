/** ADR-0013: an area roof is assembled from per-module summaries. Every
 *  registered summarizer runs here against the demo project of every type that
 *  has its room, offline on the local store, and must return a well-formed card:
 *  a known status, a metric with both halves when present, and no NaN or
 *  undefined leaking into the copy, in both locales. A summarizer that throws
 *  is a roof card that silently degrades to an entry tile — this is where that
 *  is caught, not on a tenant's screen. */
process.env.LOCAL_DB = "true";

import { mock, test } from "node:test";
import assert from "node:assert/strict";

// The catalog loaders read the signed-in user; next-auth does not load under the
// unit runner, so the session is the one seam faked here (as other suites do).
mock.module("@/lib/session", {
  namedExports: { currentUserId: async () => "u-roof-test", currentSession: async () => null },
});

const { SUMMARIZERS, summaryCoverage } = await import("@/lib/projects/roof");
const { MODULES } = await import("@/lib/projects/modules");
const { DEMO_PROJECTS } = await import("@/lib/demo/projects");

const STATUSES = new Set(["ok", "attention", "empty", "disconnected"]);

test("every registered summarizer names a real room", () => {
  for (const key of Object.keys(SUMMARIZERS)) {
    const m = MODULES.find((x) => x.key === key);
    assert.ok(m, `summarizer for unknown module "${key}"`);
    assert.ok(m.area !== "home" && m.area !== "settings", `"${key}" is not a room (no roof shows it)`);
  }
});

for (const [key, load] of Object.entries(SUMMARIZERS)) {
  test(`summary "${key}" is well-formed for every type that has the room`, async () => {
    const { default: summarize } = await load();
    const mod = MODULES.find((x) => x.key === key);
    for (const project of DEMO_PROJECTS.filter((p) => mod.availableFor.includes(p.type))) {
      for (const locale of ["en", "cs"]) {
        const s = await summarize({ project, userId: "u-roof-test", locale });
        assert.ok(STATUSES.has(s.status), `${key}/${project.type}: status "${s.status}"`);
        if (s.metric) {
          assert.ok(s.metric.label && s.metric.value, `${key}/${project.type}: metric has both halves`);
          assert.ok(!/NaN|undefined|Infinity/.test(s.metric.value), `${key}/${project.type}: metric "${s.metric.value}"`);
        }
        if (s.note) assert.ok(!/undefined|NaN/.test(s.note), `${key}/${project.type}: note "${s.note}"`);
      }
    }
  });
}

test("coverage is reported against the rooms the registry has", () => {
  const { covered, total } = summaryCoverage();
  assert.equal(covered, Object.keys(SUMMARIZERS).length);
  assert.ok(total >= covered && total > 20, `rooms counted: ${total}`);
});
