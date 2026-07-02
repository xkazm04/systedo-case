/** Unit tests for the "refine with instructions" plumbing: the shared prompt
 *  fragment (src/lib/ai/tools/refine) and the validators threading + capping the
 *  note (src/lib/ai/validation). The note must reach the validated value on the
 *  non-gate-locked tools (it busts the input-hash cache and lands in the user
 *  prompt) and must NOT leak into the gate-locked ads request. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REFINE_MAX, refineLines } from "@/lib/ai/tools/refine";
import {
  validateAdRequest,
  validateKeywordClustersRequest,
  validateRepurposeRequest,
} from "@/lib/ai/validation";

test("refineLines returns [] for missing / blank notes", () => {
  assert.deepEqual(refineLines(undefined), []);
  assert.deepEqual(refineLines(""), []);
  assert.deepEqual(refineLines("   "), []);
});

test("refineLines emits a separator, an instruction line and the note", () => {
  const lines = refineLines("kratší, více na benefity");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "");
  assert.match(lines[1], /DODATEČNÉ POKYNY UŽIVATELE/);
  assert.equal(lines[2], "kratší, více na benefity");
});

test("refineLines caps an over-long note at REFINE_MAX", () => {
  const lines = refineLines("x".repeat(REFINE_MAX + 200));
  assert.ok(lines[2].length <= REFINE_MAX, `expected <= ${REFINE_MAX}, got ${lines[2].length}`);
  assert.ok(lines[2].endsWith("…"), "clamped note is marked with an ellipsis");
});

test("validateRepurposeRequest threads + caps the refine note", () => {
  const base = {
    title: "Jak skladovat ořechy",
    url: "https://example.com/clanek",
    tone: "pratelsky",
    channels: ["LinkedIn"],
  };
  const ok = validateRepurposeRequest({ ...base, refine: "  vynech ceny  " });
  assert.ok(ok.valid);
  assert.equal(ok.value.refine, "vynech ceny");

  const long = validateRepurposeRequest({ ...base, refine: "y".repeat(REFINE_MAX + 50) });
  assert.ok(long.valid);
  assert.equal(long.value.refine.length, REFINE_MAX);

  const none = validateRepurposeRequest(base);
  assert.ok(none.valid);
  assert.equal("refine" in none.value, false, "absent note stays absent (cache key unchanged)");
});

test("validateKeywordClustersRequest threads the refine note", () => {
  const p = validateKeywordClustersRequest({
    keywords: [{ keyword: "kešu" }, { keyword: "mandle" }],
    refine: "rozděl podle záměru",
  });
  assert.ok(p.valid);
  assert.equal(p.value.refine, "rozděl podle záměru");
});

test("validateAdRequest (gate-locked tool) does NOT pass refine through", () => {
  const p = validateAdRequest({
    product: "Kešu ořechy",
    benefits: "100% natural",
    audience: "zdravý životní styl",
    platform: "google",
    tone: "vecny",
    refine: "kratší",
  });
  assert.ok(p.valid);
  assert.equal("refine" in p.value, false);
});
