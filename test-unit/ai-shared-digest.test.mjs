/** Unit tests for the `digest` prompt-bounding helper (src/lib/ai/tools/_shared):
 *  a long source article must be capped to a head + closing excerpt (middle
 *  elided) so it can't blow up a prompt or token cost, while short text passes
 *  through untouched. Backs Tiger finding C5 (repurpose's unbounded body). Runs
 *  the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { digest } from "@/lib/ai/tools/_shared";

test("digest is a no-op when the text is within the limit", () => {
  const short = "Krátký článek o skladování ořechů.";
  assert.equal(digest(short, 6000), short);
});

test("digest trims surrounding whitespace on short text", () => {
  assert.equal(digest("  hello  ", 6000), "hello");
});

test("digest bounds a long article to <= max and keeps head + tail", () => {
  const head = "ZACATEK-".repeat(1000); // ~8000 chars
  const tail = "-KONEC".repeat(1000);
  const long = `${head}STRED${tail}`;
  const out = digest(long, 6000);
  assert.ok(out.length <= 6000, `expected <= 6000, got ${out.length}`);
  assert.ok(out.startsWith("ZACATEK-"), "keeps the lead");
  assert.ok(out.endsWith("-KONEC"), "keeps the closing");
  assert.ok(out.includes("[…]"), "marks the elided middle");
  assert.ok(!out.includes("STRED"), "drops the middle");
});

test("digest is idempotent — re-digesting a digested body changes nothing", () => {
  const long = "x".repeat(20000);
  const once = digest(long, 6000);
  assert.equal(digest(once, 6000), once);
});
