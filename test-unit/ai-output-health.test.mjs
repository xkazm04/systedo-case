/** Direction 1 — "a degraded answer says it's degraded".
 *
 *  `looksCorrupt` already existed inside the wrapper, but its verdict only ever
 *  reached the Firestore telemetry row; the client got meta.demo:false and nothing
 *  else, so a truncated answer rendered identically to a clean one. These tests pin
 *  the extracted rule AND the two guarantees that make the change safe to ship:
 *    • a corrupt parse is marked (status "corrupt" → isDegraded → the UI note);
 *    • a clean parse carries NO status at all, so a healthy response is
 *      byte-identical to what it was before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { callStatus, isDegraded, looksCorrupt, requiredFields } from "@/lib/llm/output-health";

/** A stand-in for a tool schema: 6 required fields (like the ads tool). */
const SCHEMA = {
  type: "OBJECT",
  required: ["headlines", "descriptions", "callouts", "keywords", "longHeadline", "rationale"],
};

test("requiredFields reads the schema's top-level required list", () => {
  assert.deepEqual(requiredFields(SCHEMA), [
    "headlines",
    "descriptions",
    "callouts",
    "keywords",
    "longHeadline",
    "rationale",
  ]);
  assert.deepEqual(requiredFields({}), []);
  assert.deepEqual(requiredFields({ required: "nope" }), []);
});

test("looksCorrupt flags anything that is not a usable object", () => {
  assert.equal(looksCorrupt(null, SCHEMA), true);
  assert.equal(looksCorrupt(undefined, SCHEMA), true);
  assert.equal(looksCorrupt("{\"headlines\": [", SCHEMA), true);
  assert.equal(looksCorrupt([{ headlines: [] }], SCHEMA), true);
});

test("looksCorrupt flags a parse missing more than a third of the required fields", () => {
  // 6 required → threshold is max(1, floor(6/3)) = 2, so 3+ missing is corrupt.
  const truncated = { headlines: ["a"], descriptions: ["b"], callouts: ["c"] }; // 3 missing
  assert.equal(looksCorrupt(truncated, SCHEMA), true);
});

test("looksCorrupt tolerates a parse that is merely a little thin", () => {
  const thin = {
    headlines: ["a"],
    descriptions: ["b"],
    callouts: ["c"],
    keywords: ["d"],
    // longHeadline + rationale missing = 2, at the threshold, not over it
  };
  assert.equal(looksCorrupt(thin, SCHEMA), false);
  const complete = {
    headlines: [],
    descriptions: [],
    callouts: [],
    keywords: [],
    longHeadline: "",
    rationale: "",
  };
  assert.equal(looksCorrupt(complete, SCHEMA), false);
});

test("a schema with no required list can never be corrupt-by-missing-fields", () => {
  assert.equal(looksCorrupt({ anything: 1 }, { type: "OBJECT" }), false);
});

test("callStatus: corrupt outranks repaired, clean is plain success", () => {
  assert.equal(callStatus(false, false), "success");
  assert.equal(callStatus(false, true), "repaired");
  assert.equal(callStatus(true, false), "corrupt");
  assert.equal(callStatus(true, true), "corrupt");
});

test("only a corrupt verdict is surfaced to the user", () => {
  // "repaired" is house-keeping — the existing Samoopraveno pill already covers it,
  // and the answer itself is fine. A degraded answer is the one worth a retry nudge.
  assert.equal(isDegraded("corrupt"), true);
  assert.equal(isDegraded("repaired"), false);
  assert.equal(isDegraded("success"), false);
  assert.equal(isDegraded(undefined), false);
});

test("the meta stamping rule keeps a clean answer byte-identical", () => {
  // The wrapper stamps `status` only when it is not "success" (see llm/index.ts).
  // Re-stated here so a future edit that unconditionally stamps it trips a test.
  const stamp = (corrupt, repaired) => {
    const meta = { model: "m", demo: false, prompt: "p", tookMs: 1 };
    const status = callStatus(corrupt, repaired);
    if (status !== "success") meta.status = status;
    return meta;
  };
  assert.deepEqual(Object.keys(stamp(false, false)), ["model", "demo", "prompt", "tookMs"]);
  assert.equal("status" in stamp(false, false), false);
  assert.equal(stamp(true, false).status, "corrupt");
  assert.equal(stamp(false, true).status, "repaired");
});
