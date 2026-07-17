/** resolveRunCeilingMs (src/lib/ai/status-core.ts) — the client abort ceiling
 *  derived from the provider that would actually serve (runtime `wouldServe`),
 *  not the NODE_ENV-keyed build constant. A Claude-backed prod deploy must NOT
 *  abort at the tight Gemini ceiling while the server bills a real result. Pure. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunCeilingMs } from "@/lib/ai/status-core";

const opts = { claudeMs: 120_000, geminiMs: 60_000, fallbackMs: 90_000 };

test("null status falls back to the build-time default", () => {
  assert.equal(resolveRunCeilingMs(null, "ads", opts), 90_000);
});

test("Claude serving path uses the tolerant ceiling even without a sample", () => {
  assert.equal(resolveRunCeilingMs({ wouldServe: "claude" }, "ads", opts), 120_000);
});

test("Gemini serving path uses the tight ceiling", () => {
  assert.equal(resolveRunCeilingMs({ wouldServe: "gemini" }, "ads", opts), 60_000);
});

test("demo/unknown path keeps the fallback", () => {
  assert.equal(resolveRunCeilingMs({ wouldServe: "demo" }, "ads", opts), 90_000);
});

test("an observed latency sample raises the ceiling to 2x when higher than the base", () => {
  assert.equal(
    resolveRunCeilingMs({ wouldServe: "gemini", latency: { ads: 40_000 } }, "ads", opts),
    80_000
  );
});

test("a small latency sample never lowers the provider base", () => {
  assert.equal(
    resolveRunCeilingMs({ wouldServe: "claude", latency: { ads: 5_000 } }, "ads", opts),
    120_000
  );
});

test("a junk/zero latency sample is ignored", () => {
  assert.equal(resolveRunCeilingMs({ wouldServe: "gemini", latency: { ads: 0 } }, "ads", opts), 60_000);
});
