/** Repurpose billing honesty (src/lib/ai/tools/repurpose.ts) — the fix that ports
 *  social.ts's Direction-2 pattern: validateRepurpose now flags any REQUESTED channel
 *  missing a usable variant (so an empty/partial answer triggers the one repair
 *  re-prompt), and normalizeRepurposeTracked reports how many channels the MODEL filled
 *  (vs. backfilled from the canned templates) so the caller can bill a fully/partly
 *  canned answer as demo/partialDemo instead of as a real generation. Pure — no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { validateRepurpose, normalizeRepurposeTracked } = await import("@/lib/ai/tools/repurpose");
const { NOT_OBJECT_VIOLATION } = await import("@/lib/ai/tools/_validate");

const CH = ["LinkedIn", "Instagram"];
const req = { title: "Skladování ořechů", url: "https://orecharna.cz/clanek/orechy" };

// ── validateRepurpose: requires a variant per requested channel ────────────────

test("validateRepurpose: a non-object always fails (triggers the one repair)", () => {
  assert.deepEqual(validateRepurpose(CH, null), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validateRepurpose(CH, "nope"), [NOT_OBJECT_VIOLATION]);
});

test("validateRepurpose: an EMPTY variant set fails for every requested channel", () => {
  const v = validateRepurpose(CH, { variants: [] });
  assert.equal(v.length, 2);
  assert.ok(v.every((m) => /Chybí varianta pro kanál/.test(m)));
});

test("validateRepurpose: a PARTIAL set flags only the missing channel", () => {
  const v = validateRepurpose(CH, { variants: [{ channel: "LinkedIn", text: "Ahoj" }] });
  assert.equal(v.length, 1);
  assert.match(v[0], /Instagram/);
});

test("validateRepurpose: a COMPLETE set passes (no violations)", () => {
  const v = validateRepurpose(CH, {
    variants: [
      { channel: "LinkedIn", text: "A" },
      { channel: "Instagram", text: "B" },
    ],
  });
  assert.deepEqual(v, []);
});

test("validateRepurpose: over-limit is still flagged alongside a missing channel", () => {
  const long = "x".repeat(3001); // > LinkedIn limit (3000)
  const v = validateRepurpose(CH, { variants: [{ channel: "LinkedIn", text: long }] });
  assert.ok(v.some((m) => /limit/.test(m)), "over-limit flagged");
  assert.ok(v.some((m) => /Instagram/.test(m)), "missing Instagram flagged");
});

// ── normalizeRepurposeTracked: modelCount drives the demo/partialDemo billing ───

test("normalizeRepurposeTracked: modelCount counts channels the MODEL filled", () => {
  const both = normalizeRepurposeTracked(
    { variants: [{ channel: "LinkedIn", text: "A" }, { channel: "Instagram", text: "B" }] },
    CH,
    req
  );
  assert.equal(both.modelCount, 2, "all requested filled → none backfilled");

  const one = normalizeRepurposeTracked({ variants: [{ channel: "LinkedIn", text: "A" }] }, CH, req);
  assert.equal(one.modelCount, 1, "one filled, one backfilled → partial");
  assert.equal(one.result.variants.length, 2, "still returns a variant per requested channel");

  const none = normalizeRepurposeTracked({ variants: [] }, CH, req);
  assert.equal(none.modelCount, 0, "nothing filled → fully canned");
  assert.equal(none.result.variants.length, 2, "backfilled from templates");
  assert.ok(none.result.variants.every((x) => x.text.length > 0), "templates are non-empty");
});
