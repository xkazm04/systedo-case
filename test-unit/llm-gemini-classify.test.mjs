/** The Gemini SDK path's typed error taxonomy. `@google/genai` rejects with its
 *  own ApiError, which is neither an LlmCallError nor a TypeError — untyped, it
 *  reached the wrapper as non-retryable, so a single 429/503 on the PROD primary
 *  provider degraded the user straight to the demo. Covers the pure mapper and the
 *  provider itself (mocked fetch — no network, no real key). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGeminiError, runGemini } from "@/lib/llm/gemini";
import { LlmCallError, isRetryableLlmError } from "@/lib/llm/errors";

/** An `@google/genai` ApiError: HTTP status + the stringified error body. */
const apiError = (status, body = {}) =>
  Object.assign(new Error(JSON.stringify(body)), { name: "ApiError", status });

test("classifyGeminiError: 429 → rate_limited (retryable)", () => {
  const err = classifyGeminiError(apiError(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } }));
  assert.ok(err instanceof LlmCallError);
  assert.equal(err.code, "rate_limited");
  assert.equal(err.status, 429);
  assert.equal(isRetryableLlmError(err), true);
});

test("classifyGeminiError: a 429 backoff hint is honored, from a header or the RetryInfo body", () => {
  const withHeader = Object.assign(apiError(429), {
    headers: { get: (k) => (k.toLowerCase() === "retry-after" ? "3" : null) },
  });
  assert.equal(classifyGeminiError(withHeader).retryAfterMs, 3000);
  // The SDK's ApiError drops the response headers, so a real throttle only ever
  // carries its delay in the stringified body.
  const body = { error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "36s" }] } };
  assert.equal(classifyGeminiError(apiError(429, body)).retryAfterMs, 36000);
  assert.equal(classifyGeminiError(apiError(429)).retryAfterMs, undefined);
});

test("classifyGeminiError: 5xx → server (retryable), other 4xx → unknown (not retried)", () => {
  for (const status of [500, 502, 503]) {
    const err = classifyGeminiError(apiError(status));
    assert.equal(err.code, "server", String(status));
    assert.equal(err.retryable, true, String(status));
  }
  for (const status of [400, 401, 403, 404]) {
    const err = classifyGeminiError(apiError(status));
    assert.equal(err.code, "unknown", String(status));
    assert.equal(err.retryable, false, String(status));
  }
});

test("classifyGeminiError: a transport failure → network (retryable)", () => {
  assert.equal(classifyGeminiError(new TypeError("fetch failed")).code, "network");
  assert.equal(classifyGeminiError(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })).code, "network");
});

test("classifyGeminiError: typed errors and aborts pass through untouched", () => {
  // Only deadline.ts can tell a caller abort (`aborted`) from a deadline fire
  // (`timeout`), so an abort-shaped rejection must reach it unclassified.
  const typed = new LlmCallError("empty", "prázdná odpověď");
  assert.equal(classifyGeminiError(typed), typed);
  for (const name of ["AbortError", "TimeoutError"]) {
    const abort = Object.assign(new Error("stop"), { name });
    assert.equal(classifyGeminiError(abort), abort);
  }
});

// ── through the provider itself (the SDK's own fetch is stubbed) ───────────────
const CALL = { system: "sys", prompt: "make json", schema: { type: "OBJECT" } };

/** Swap global.fetch for one JSON response; returns a restore fn. */
function stubFetch(status, body, headers = {}) {
  const original = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  return () => (global.fetch = original);
}

test("runGemini: a 503 from the SDK surfaces as a typed, retryable server error", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const restore = stubFetch(503, { error: { code: 503, message: "model overloaded" } });
  try {
    await assert.rejects(
      () => runGemini(CALL),
      (e) => e instanceof LlmCallError && e.code === "server" && e.retryable && e.provider === "gemini"
    );
  } finally {
    restore();
  }
});

test("runGemini: a 429 from the SDK surfaces as rate_limited carrying its backoff", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const restore = stubFetch(429, {
    error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" }] },
  });
  try {
    await assert.rejects(
      () => runGemini(CALL),
      (e) => e instanceof LlmCallError && e.code === "rate_limited" && e.retryAfterMs === 12000 && e.retryable
    );
  } finally {
    restore();
  }
});
