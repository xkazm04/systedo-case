/** Direction 3 — platform-aware campaign eval.
 *
 *  The eval persona is a Google Ads specialist, but Sklik-sourced tenants flow
 *  through the same store/pipeline since the Sklik connector shipped — they used to
 *  get Google-specific advice (PMax, Google match types) for Sklik campaigns. The
 *  tenant's SyncMeta.source now steers the prompt: a "sklik" source appends a
 *  platform note (Sklik vocabulary + a ban on Google-only features) to the USER
 *  prompt, while "google-ads" / "sample" / an unknown source stay byte-identical.
 *  The SYSTEM prompt never branches, so the gate/golden fingerprint is untouched.
 *
 *  campaign-eval.ts is JSON-free, so it imports directly under the resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { platformEvalLines } from "@/lib/ai/tools/campaign-eval";

test("google-ads / sample / unknown / undefined → no platform lines (byte-identical)", () => {
  assert.deepEqual(platformEvalLines("google-ads"), []);
  assert.deepEqual(platformEvalLines("sample"), []);
  assert.deepEqual(platformEvalLines(undefined), []);
  // An open union: any future/unknown source defaults to the Google persona, never
  // a half-applied Sklik note.
  assert.deepEqual(platformEvalLines("meta-ads"), []);
});

test("sklik → Sklik vocabulary + a ban on Google-only features", () => {
  const lines = platformEvalLines("sklik");
  assert.ok(lines.length > 0, "sklik produces platform lines");
  const text = lines.join("\n");

  // Names Sklik and its own campaign vocabulary (honest, general — no invented features).
  assert.match(text, /Sklik/);
  assert.match(text, /kombinovaná reklama/);
  assert.match(text, /zbožový Sklik/);
  assert.match(text, /Sklik sítě/);

  // Bans the Google-only formats a Sklik tenant must not be told to use.
  assert.match(text, /PMax|Performance Max/);
  assert.match(text, /Demand Gen/);

  // Rides the user prompt as a clean appendable block (leading blank separator).
  assert.equal(lines[0], "");
});
