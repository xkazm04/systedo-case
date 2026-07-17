/** classifyProbeError: a "test connection" outcome must distinguish a definitive
 *  invalid-key (a ByomUserError — worth sticky-disabling the key) from an
 *  inconclusive/transient failure (a provider blip — which must NOT bench a healthy
 *  key). Guards the sticky-validation-failure bug. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProbeError } from "@/lib/llm/keys/validate";
import { ByomUserError, LlmCallError } from "@/lib/llm/errors";

test("classifyProbeError: a ByomUserError is a definitive failure (not transient)", () => {
  const out = classifyProbeError(new ByomUserError("auth", "openai", "Neplatný klíč", 401));
  assert.equal(out.ok, false);
  assert.equal(out.transient, undefined);
  assert.equal(out.error, "Neplatný klíč");
});

test("classifyProbeError: a transient LlmCallError (server/rate_limited/timeout/network) is INCONCLUSIVE", () => {
  for (const code of ["server", "rate_limited", "timeout", "network", "empty", "malformed_json"]) {
    const out = classifyProbeError(new LlmCallError(code, `blip ${code}`));
    assert.equal(out.ok, false, code);
    assert.equal(out.transient, true, code);
    assert.equal(out.error, `blip ${code}`);
  }
});

test("classifyProbeError: an unknown/plain error is inconclusive, never a sticky disable", () => {
  const out = classifyProbeError(new Error("boom"));
  assert.equal(out.ok, false);
  assert.equal(out.transient, true);
  assert.equal(out.error, "boom");
  const out2 = classifyProbeError("weird");
  assert.equal(out2.transient, true);
  assert.equal(out2.error, "Test spojení se nezdařil.");
});
