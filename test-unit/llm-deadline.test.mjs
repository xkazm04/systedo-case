/** Direction 2 — wrapper deadlines. A provider that never resolves is bounded by a
 *  composed deadline (caller signal + AbortSignal.timeout) and surfaces a typed
 *  LlmCallError: a deadline fire → `timeout` (retryable), a caller abort →
 *  `aborted` (non-retryable). Pure — no provider, no network, no telemetry. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyProviderError, runWithDeadline, withDeadline } from "@/lib/llm/deadline";
import { LlmCallError } from "@/lib/llm/errors";

/** A fake provider op that never resolves on its own but rejects when its signal
 *  aborts (exactly how a well-behaved fetch/SDK/CLI behaves under abort). */
const hang = (signal) =>
  new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });

test("a hanging provider trips the deadline → typed timeout (retryable)", async () => {
  await assert.rejects(
    () => runWithDeadline(hang, 25),
    (e) => e instanceof LlmCallError && e.code === "timeout" && e.retryable
  );
});

test("a caller abort beats the deadline → typed aborted (non-retryable)", async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 10).unref?.();
  await assert.rejects(
    () => runWithDeadline(hang, 5000, ac.signal),
    (e) => e instanceof LlmCallError && e.code === "aborted" && !e.retryable
  );
});

test("an already-aborted caller never waits the full deadline", async () => {
  const ac = new AbortController();
  ac.abort();
  const t0 = Date.now();
  await assert.rejects(
    () => runWithDeadline(hang, 60_000, ac.signal),
    (e) => e instanceof LlmCallError && e.code === "aborted"
  );
  assert.ok(Date.now() - t0 < 1000, "returned promptly, not after 60s");
});

test("a raw fetch transport failure (TypeError) → typed network (retryable)", async () => {
  const boom = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(
    () => runWithDeadline(boom, 5000),
    (e) => e instanceof LlmCallError && e.code === "network" && e.retryable
  );
});

test("an already-typed provider error passes through unchanged", async () => {
  const typed = new LlmCallError("malformed_json", "bad json", { provider: "gemini" });
  await assert.rejects(
    () => runWithDeadline(async () => { throw typed; }, 5000),
    (e) => e === typed
  );
});

test("classifyProviderError maps a bare deadline-abort to timeout", () => {
  const { deadline } = withDeadline(undefined, 1);
  // Force the deadline to have fired for a deterministic classification.
  const ac = new AbortController();
  ac.abort(new DOMException("timed out", "TimeoutError"));
  const e = classifyProviderError(ac.signal.reason, undefined, ac.signal, 1);
  assert.ok(e instanceof LlmCallError && e.code === "timeout");
  assert.ok(deadline instanceof AbortSignal);
});

test("withDeadline composes a caller signal with a fresh deadline", () => {
  const ac = new AbortController();
  const { signal, deadline } = withDeadline(ac.signal, 5000);
  assert.equal(signal.aborted, false);
  assert.equal(deadline.aborted, false);
  ac.abort();
  assert.equal(signal.aborted, true, "composed signal follows the caller abort");
});
