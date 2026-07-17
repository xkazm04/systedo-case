/** normalizeProjectPatch (src/lib/projects/types.ts): the single patch-normalization
 *  both store backends share so they persist identical data for identical calls.
 *  Contract: undefined key = leave as-is (absent from output); empty/whitespace on a
 *  nullable field = clear (null); text is trimmed; a blank name is dropped (ignored). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProjectPatch } from "@/lib/projects/types";

test("absent keys stay absent (leave-as-is)", () => {
  assert.deepEqual(normalizeProjectPatch({}), {});
  assert.deepEqual(normalizeProjectPatch({ accentColor: "#fff" }), { accentColor: "#fff" });
});

test("empty / whitespace nullable field clears to null", () => {
  assert.equal(normalizeProjectPatch({ logoUrl: "" }).logoUrl, null);
  assert.equal(normalizeProjectPatch({ domain: "   " }).domain, null);
  assert.equal(normalizeProjectPatch({ adsCustomerId: "" }).adsCustomerId, null);
});

test("a value on a nullable field is trimmed and kept", () => {
  assert.equal(normalizeProjectPatch({ domain: "  acme.cz  " }).domain, "acme.cz");
  assert.equal(normalizeProjectPatch({ logoUrl: " https://x/y.png " }).logoUrl, "https://x/y.png");
});

test("a cleared field is PRESENT as null (so backends remove it), not absent", () => {
  const out = normalizeProjectPatch({ domain: "" });
  assert.ok("domain" in out, "cleared field must be present so the backend clears it");
  assert.equal(out.domain, null);
});
