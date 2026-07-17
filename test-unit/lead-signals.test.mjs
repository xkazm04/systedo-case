/** C2 lead-signals grounding (src/lib/lead-signals/summary.ts): the recap gets a
 *  lead-source-quality / CPQL / velocity block for leadgen & local, and nothing for
 *  types without a lead funnel. Pure — no store, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url); // defensive: any transitive JSON import

const { leadSignalsPromptText } = await import("@/lib/lead-signals/summary");

const leadgen = { id: "lg-1", name: "Služby s.r.o.", type: "leadgen" };
const local = { id: "loc-1", name: "Dentalis", type: "local" };
const eshop = { id: "es-1", name: "Acme", type: "eshop" };

test("leadgen: grounds junk sources, CPQL and velocity", () => {
  const text = leadSignalsPromptText(leadgen);
  assert.ok(text, "leadgen must get a lead block");
  assert.match(text, /CPQL/); // cost per qualified lead is present
  assert.match(text, /Junk zdroje/); // the sample's Meta source is junk (<35% qual)
  assert.match(text, /kvalifikovan/i); // qualification framing
  assert.match(text, /velocity|Rychlost/i); // speed signal
});

test("local also has a lead funnel → gets the block", () => {
  assert.ok(leadSignalsPromptText(local));
});

test("e-shop has no lead funnel → null (no lead block in the recap)", () => {
  assert.equal(leadSignalsPromptText(eshop), null);
});

test("output is deterministic for the same project", () => {
  assert.equal(leadSignalsPromptText(leadgen), leadSignalsPromptText(leadgen));
});

test("scaling to a tiny target lead total preserves the funnel invariant (qualified <= leads)", () => {
  // A quiet period: a very small targetLeads makes the scale factor tiny, where naive
  // per-field rounding could round qualified above leads. The clamp must keep the
  // narrated funnel coherent.
  const text = leadSignalsPromptText(leadgen, 3);
  assert.ok(text, "still produces a block");
  const m = /Leadů:\s*(\d+);\s*kvalifikovaných:\s*(\d+)/.exec(text);
  assert.ok(m, "the leads/qualified line is present");
  const leads = Number(m[1]);
  const qualified = Number(m[2]);
  assert.equal(leads, 3, "the narrated total matches the target tile exactly");
  assert.ok(qualified <= leads, `qualified (${qualified}) must not exceed leads (${leads})`);
});
