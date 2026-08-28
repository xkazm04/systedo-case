/** Bench regression (llm-core-providers-01): Gemini SDK rejections must be
 *  classified into the typed retry taxonomy. runGemini calls generateContent with
 *  no try/catch and no status mapping, so an SDK 429/5xx rejection is neither an
 *  LlmCallError nor a TypeError — isRetryableLlmError returns false, the wrapper
 *  skips its bounded retry, and in cloud prod (gemini→claude, CLI unavailable) one
 *  transient hiccup degrades the user straight to the canned demo. The BYOM
 *  adapters map raw HTTP statuses into typed codes exactly as designed; only the
 *  app's own Gemini SDK path lacks the mapping. These tests fail until a Gemini
 *  SDK error (429 / 503) surfaces as a retryable typed LlmCallError.
 *
 *  Run with --experimental-test-module-mocks (@google/genai is mocked). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

/** The error the next generateContent call rejects with (null → resolve fine). */
let nextError = null;

/** Mirrors the SDK's ApiError surface: an Error with a numeric `status`. */
class ApiError extends Error {
  constructor(opts) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
  }
}

class GoogleGenAI {
  constructor() {
    this.models = {
      generateContent: async () => {
        if (nextError) throw nextError;
        return { text: JSON.stringify({ ok: true }) };
      },
    };
  }
}

mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI,
    ApiError,
    Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", NUMBER: "NUMBER", INTEGER: "INTEGER", BOOLEAN: "BOOLEAN" },
  },
});

const { runGemini } = await import("@/lib/llm/gemini");
const { LlmCallError, isRetryableLlmError } = await import("@/lib/llm/errors");

const CALL = { system: "sys", prompt: "prompt", schema: { type: "OBJECT" } };

test("control: a missing key is a typed non-retryable LlmCallError", async () => {
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    () => runGemini(CALL),
    (err) => err instanceof LlmCallError && err.code === "unknown" && !isRetryableLlmError(err)
  );
});

test("control: a successful SDK response parses through the mock", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextError = null;
  const out = await runGemini(CALL);
  assert.deepEqual(out.parsed, { ok: true });
});

test("an SDK 429 rejection surfaces as a RETRYABLE typed LlmCallError", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextError = new ApiError({ message: "got status: 429 . RESOURCE_EXHAUSTED: quota exceeded", status: 429 });
  let caught;
  try {
    await runGemini(CALL);
    assert.fail("runGemini must reject when the SDK rejects");
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof LlmCallError,
    `a Gemini SDK 429 must be mapped into the typed taxonomy, got untyped ${caught?.name}: ${caught?.message}`
  );
  assert.equal(
    isRetryableLlmError(caught),
    true,
    "a 429 throttle must be retryable (rate_limited) so the wrapper's bounded retry fires"
  );
});

test("an SDK 503 rejection surfaces as a RETRYABLE typed LlmCallError", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextError = new ApiError({ message: "got status: 503 . UNAVAILABLE: service overloaded", status: 503 });
  let caught;
  try {
    await runGemini(CALL);
    assert.fail("runGemini must reject when the SDK rejects");
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof LlmCallError,
    `a Gemini SDK 503 must be mapped into the typed taxonomy, got untyped ${caught?.name}: ${caught?.message}`
  );
  assert.equal(
    isRetryableLlmError(caught),
    true,
    "a transient 5xx must be retryable (server) so the wrapper's bounded retry fires"
  );
});
