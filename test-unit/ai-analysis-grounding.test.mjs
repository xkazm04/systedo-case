/** Direction 2 — analysis sees the project's data.
 *
 *  generateAnalysis now builds its snapshot from the caller's resolved dataset
 *  (buildSnapshot(period, "previous", data)) instead of always the base case-study
 *  spine. This locks the deterministic composition it uses for the demo/floor —
 *  buildSnapshot(data) → demoAnalysis — at the pure layer: a project's own client +
 *  numbers must flow into the analysis output, while an absent dataset stays
 *  byte-identical to the base case study (the no-project cache-key / prompt
 *  invariant the route relies on).
 *
 *  snapshot.ts imports src/data/performance.json without an import attribute (Next
 *  handles it; raw Node needs one), so a tiny local JSON load hook is registered
 *  and the modules are dynamically imported. The hook is scoped to this file. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

const BASE = JSON.parse(
  readFileSync(new URL("../src/data/performance.json", import.meta.url), "utf8")
);

const JSON_HOOK =
  "data:text/javascript," +
  encodeURIComponent(`
    export async function load(url, context, next) {
      if (url.endsWith('.json')) {
        return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
      }
      return next(url, context);
    }
  `);

let buildSnapshot;
let demoAnalysis;

before(async () => {
  register(JSON_HOOK, import.meta.url);
  const [snap, analysis] = await Promise.all([
    import("@/lib/snapshot"),
    import("@/lib/ai/tools/analysis"),
  ]);
  buildSnapshot = snap.buildSnapshot;
  demoAnalysis = analysis.demoAnalysis;
});

test("a project's dataset flows into the analysis output (grounded path)", () => {
  // The exact composition generateAnalysis uses for its floor/demo, once with a
  // project's own dataset and once with the base — the demo summary names the
  // snapshot's client, so a different dataset must produce different, grounded text.
  const project = {
    ...BASE,
    client: { ...BASE.client, name: "Kavárna U Kotvy" },
  };
  const grounded = demoAnalysis(buildSnapshot("30d", "previous", project));
  const base = demoAnalysis(buildSnapshot("30d", "previous", BASE));

  assert.match(grounded.summary, /Kavárna U Kotvy/, "grounded summary names the project's client");
  assert.doesNotMatch(base.summary, /Kavárna U Kotvy/, "base summary does not");
  assert.notEqual(grounded.summary, base.summary, "a different dataset yields different analysis");
});

test("no dataset is byte-identical to the base case study (no-project invariant)", () => {
  // generateAnalysis passes `data` straight through; undefined must fall back to
  // buildSnapshot's base default, so the ungrounded path stays byte-identical —
  // the request-shape / cache-key / prompt invariant the route depends on.
  const explicitBase = demoAnalysis(buildSnapshot("30d", "previous", BASE));
  const defaulted = demoAnalysis(buildSnapshot("30d", "previous", undefined));
  assert.deepEqual(defaulted, explicitBase);
});
