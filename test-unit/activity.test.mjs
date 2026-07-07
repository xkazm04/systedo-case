/** Activity compute (src/lib/activity/compute.ts) + seeded feed (sample.ts):
 *  filter, severity rollup, active modules, CSV escaping, determinism. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { actorFor, activeModules, csvCell, filterActivity, recordToEvent, severityCounts } from "@/lib/activity/compute";
import { activityForProject } from "@/lib/activity/sample";

const ev = (over = {}) => ({
  id: "e", module: "recenze", tmpl: "x", severity: "info", actor: "system", daysAgo: 3, params: {}, ...over,
});

test("filterActivity narrows by module, severity and window", () => {
  const events = [
    ev({ id: "a", module: "recenze", severity: "success", daysAgo: 2 }),
    ev({ id: "b", module: "mapa", severity: "warning", daysAgo: 20 }),
    ev({ id: "c", module: "recenze", severity: "critical", daysAgo: 40 }),
  ];
  const base = { module: "all", severity: "all", windowDays: 0 };
  assert.deepEqual(filterActivity(events, { ...base, module: "recenze" }).map((e) => e.id), ["a", "c"]);
  assert.deepEqual(filterActivity(events, { ...base, severity: "warning" }).map((e) => e.id), ["b"]);
  assert.deepEqual(filterActivity(events, { ...base, windowDays: 7 }).map((e) => e.id), ["a"]);
});

test("severityCounts tallies all four levels", () => {
  const c = severityCounts([ev({ severity: "info" }), ev({ severity: "critical" }), ev({ severity: "critical" })]);
  assert.deepEqual(c, { info: 1, success: 0, warning: 0, critical: 2 });
});

test("activeModules is distinct, first-seen order", () => {
  assert.deepEqual(activeModules([ev({ module: "mapa" }), ev({ module: "recenze" }), ev({ module: "mapa" })]), ["mapa", "recenze"]);
});

test("csvCell quotes only when needed and escapes quotes", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
});

test("actorFor maps labels to ai/system/you", () => {
  assert.equal(actorFor(undefined), "system");
  assert.equal(actorFor("Vy"), "you");
  assert.equal(actorFor("You"), "you");
  assert.equal(actorFor("Automatická synchronizace"), "system");
  assert.equal(actorFor("Jan Novák"), "you");
});

test("recordToEvent infers module/severity from kind, or uses the record's own", () => {
  const NOW = Date.parse("2026-07-07T00:00:00.000Z");
  const inferred = recordToEvent(
    { id: "r1", kind: "alert", title: "Rozpočet vyčerpán", detail: "Kampaň X", at: "2026-07-04T00:00:00.000Z" },
    NOW
  );
  assert.equal(inferred.module, "kampane");
  assert.equal(inferred.severity, "warning");
  assert.equal(inferred.daysAgo, 3);
  assert.equal(inferred.text, "Rozpočet vyčerpán — Kampaň X");

  const explicit = recordToEvent(
    { id: "r2", kind: "update", title: "Branding upraven", detail: "", at: "2026-07-07T00:00:00.000Z", module: "branding", severity: "success", actor: "Vy" },
    NOW
  );
  assert.equal(explicit.module, "branding");
  assert.equal(explicit.severity, "success");
  assert.equal(explicit.actor, "you");
  assert.equal(explicit.text, "Branding upraven");
});

test("activityForProject is deterministic, newest-first, valid shape", () => {
  const project = { id: "demo-local", type: "local" };
  const localities = [{ id: "praha", name: "Praha", region: "Praha" }, { id: "brno", name: "Brno", region: "JMK" }];
  const a = activityForProject(project, localities, 24);
  const b = activityForProject(project, localities, 24);
  assert.deepEqual(a, b);
  assert.equal(a.length, 24);
  for (let i = 1; i < a.length; i++) assert.ok(a[i].daysAgo >= a[i - 1].daysAgo);
  for (const e of a) {
    assert.ok(["info", "success", "warning", "critical"].includes(e.severity));
    assert.ok(["ai", "system", "you"].includes(e.actor));
  }
});
