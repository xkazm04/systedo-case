/** The provider's STOP CONDITION is read before the payload is interpreted.
 *
 *  A response cut off by the output-token cap (`stop_reason: "max_tokens"`,
 *  `finish_reason: "length"`, `finishReason: "MAX_TOKENS"`) carries a body that is
 *  empty or ends mid-object. Read payload-first, that body becomes `empty` or
 *  `malformed_json` — both RETRYABLE, so the wrapper replays the identical call
 *  against the identical cap up to three times (every one billed), and the record
 *  blames the model for an answer our cap never let it finish. Read stop-first it
 *  is `truncated`: not retried on the same provider, still handed to the next one,
 *  and named as the cap it is. A provider-side content filter (`content_filter`,
 *  Gemini's SAFETY family) is likewise read off the stop, as `safety_blocked`.
 *
 *  Mocked fetch for the BYOM adapters, a mocked `@google/genai` for the app's own
 *  Gemini provider — no network, no key, no spend. Needs
 *  --experimental-test-module-mocks, which `test:unit` passes. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

/** What the mocked SDK's next generateContent call resolves to. */
let nextGeminiResponse = { text: JSON.stringify({ ok: true }) };

class GoogleGenAI {
  constructor() {
    this.models = { generateContent: async () => nextGeminiResponse };
  }
}
class ApiError extends Error {}

mock.module("@google/genai", {
  namedExports: {
    GoogleGenAI,
    ApiError,
    Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", NUMBER: "NUMBER", INTEGER: "INTEGER", BOOLEAN: "BOOLEAN" },
  },
});

const { runGemini } = await import("@/lib/llm/gemini");
const { runByom } = await import("@/lib/llm/byom/adapters.ts");
const { LlmCallError } = await import("@/lib/llm/errors");

const CALL = { system: "sys", prompt: "make json", schema: { type: "OBJECT" } };
const CUT = '{"score": 0.8, "reasoning": "cut off mid';

/** Swap global.fetch for one returning `body` with a 200; returns the call log + restore. */
function stubFetch(body) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return { calls, restore: () => (global.fetch = original) };
}

/** Run `fn`, expect a typed rejection, and say what it actually was when it is not `want`. */
async function expectCode(fn, want) {
  let err;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof LlmCallError, `expected an LlmCallError("${want}"), got ${err === undefined ? "a resolved answer" : String(err)}`);
  assert.equal(err.code, want, `stop condition read as "${err.code}" (retryable=${err.retryable})`);
  return err;
}

const byomCases = [
  ["anthropic", { stop_reason: "max_tokens", content: [{ type: "text", text: CUT }], usage: { input_tokens: 9, output_tokens: 16000 } }],
  ["anthropic", { stop_reason: "max_tokens", content: [], usage: { input_tokens: 9, output_tokens: 16000 } }],
  ["anthropic", { stop_reason: "model_context_window_exceeded", content: [{ type: "text", text: CUT }] }],
  ["openai", { choices: [{ finish_reason: "length", message: { content: CUT } }] }],
  ["openai", { choices: [{ finish_reason: "length", message: { content: "" } }] }],
  ["openrouter", { choices: [{ finish_reason: "length", message: { content: CUT } }] }],
  ["qwen", { choices: [{ finish_reason: "length", message: { content: CUT } }] }],
  ["gemini", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: CUT }] } }] }],
  ["gemini", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }],
];

for (const [vendor, body] of byomCases) {
  const shape = body.stop_reason ?? body.choices?.[0]?.finish_reason ?? body.candidates?.[0]?.finishReason;
  test(`BYOM ${vendor}: a ${shape} stop is "truncated", not retried on the same provider`, async () => {
    const f = stubFetch(body);
    try {
      const err = await expectCode(() => runByom({ vendor, apiKey: "k" }, CALL), "truncated");
      assert.equal(err.retryable, false, "the same call against the same cap truncates the same way");
    } finally {
      f.restore();
    }
  });
}

test("BYOM openai: a content_filter stop is the provider's filter, not malformed output", async () => {
  const f = stubFetch({ choices: [{ finish_reason: "content_filter", message: { content: CUT } }] });
  try {
    await expectCode(() => runByom({ vendor: "openai", apiKey: "k" }, CALL), "safety_blocked");
  } finally {
    f.restore();
  }
});

test("BYOM gemini: a SAFETY stop is the provider's filter, not an empty body", async () => {
  const f = stubFetch({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] });
  try {
    await expectCode(() => runByom({ vendor: "gemini", apiKey: "k" }, CALL), "safety_blocked");
  } finally {
    f.restore();
  }
});

test("app Gemini: a MAX_TOKENS stop with a partial body is \"truncated\"", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextGeminiResponse = { text: CUT, candidates: [{ finishReason: "MAX_TOKENS" }] };
  const err = await expectCode(() => runGemini(CALL), "truncated");
  assert.equal(err.retryable, false);
});

test("app Gemini: a MAX_TOKENS stop with no body is \"truncated\", not \"empty\"", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextGeminiResponse = { text: undefined, candidates: [{ finishReason: "MAX_TOKENS" }] };
  await expectCode(() => runGemini(CALL), "truncated");
});

test("control: a normal stop still parses on every path", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  nextGeminiResponse = { text: '{"ok":true}', candidates: [{ finishReason: "STOP" }] };
  assert.deepEqual((await runGemini(CALL)).parsed, { ok: true });
  for (const [vendor, body] of [
    ["anthropic", { stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] }],
    ["openai", { choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }] }],
    ["gemini", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"ok":true}' }] } }] }],
  ]) {
    const f = stubFetch(body);
    try {
      assert.deepEqual((await runByom({ vendor, apiKey: "k" }, CALL)).parsed, { ok: true }, vendor);
    } finally {
      f.restore();
    }
  }
});
