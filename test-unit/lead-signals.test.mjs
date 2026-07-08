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
