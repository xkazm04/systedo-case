/** Direction 1 — typed retryability. The wrapper's retry/fallback decision reads
 *  a typed LlmCallError.code, not a Czech substring, so a reworded/English provider
 *  error is classified the same as the Czech one. Covers the pure error helpers and
 *  each HTTP provider adapter's typed failure surface (mocked fetch — no network). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ByomUserError,
  LlmCallError,
  isRetryableLlmError,
  parseRetryAfterMs,
} from "@/lib/llm/errors";
import { runByom } from "@/lib/llm/byom/adapters.ts";

// ── pure error model ──────────────────────────────────────────────────────────
test("LlmCallError.retryable is code-based", () => {
  const retryable = ["timeout", "empty", "malformed_json", "rate_limited", "server", "network"];
  const notRetryable = ["safety_blocked", "aborted", "unknown"];
  for (const code of retryable) assert.equal(new LlmCallError(code, "x").retryable, true, code);
  for (const code of notRetryable) assert.equal(new LlmCallError(code, "x").retryable, false, code);
});

test("isRetryableLlmError: only typed retryable errors; plain errors never retry", () => {
  assert.equal(isRetryableLlmError(new LlmCallError("timeout", "vypršel")), true);
  assert.equal(isRetryableLlmError(new LlmCallError("safety_blocked", "blok")), false);
  // A plain Error — even one that WOULD have matched the old Czech substring list —
  // is no longer retried; classification is by code alone.
  assert.equal(isRetryableLlmError(new Error("nevrátil platný JSON")), false);
  assert.equal(isRetryableLlmError("selhal"), false);
  assert.equal(isRetryableLlmError(undefined), false);
});

test("parseRetryAfterMs: seconds, http-date, absent, and a stub without headers", () => {
  const hdr = (v) => ({ get: (k) => (k.toLowerCase() === "retry-after" ? v : null) });
  assert.equal(parseRetryAfterMs(hdr("2")), 2000);
  assert.equal(parseRetryAfterMs(hdr("0")), 0);
  assert.equal(parseRetryAfterMs(hdr(null)), undefined);
  assert.equal(parseRetryAfterMs(hdr("not-a-number")), undefined);
  assert.equal(parseRetryAfterMs(undefined), undefined); // no headers at all → no-op
  assert.equal(parseRetryAfterMs({}), undefined); // no .get → no-op
  // An HTTP-date in the future resolves to a positive ms delta.
  const future = new Date(Date.now() + 3000).toUTCString();
  const ms = parseRetryAfterMs(hdr(future));
  assert.ok(ms > 1000 && ms <= 3000, `date delta ${ms}`);
});

// ── fetch stub with header support ────────────────────────────────────────────
/** Swap global.fetch for a queued sequence of `{ status, body, headers }`. */
function stubFetch(responses) {
  const original = global.fetch;
  const calls = [];
  let i = 0;
  global.fetch = async (url, opts) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    calls.push({ url, opts });
    const headers = r.headers ?? {};
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    };
  };
  return { calls, restore: () => (global.fetch = original) };
}

const CALL = { system: "sys", prompt: "make json", schema: { type: "OBJECT" } };

// ── OpenAI adapter ────────────────────────────────────────────────────────────
test("openai: malformed content → typed malformed_json (retryable)", async () => {
  const f = stubFetch([{ status: 200, body: { choices: [{ message: { content: "not json {" } }] } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "sk" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "malformed_json" && e.retryable
    );
  } finally {
    f.restore();
  }
});

test("openai: 500 → typed server error (retryable), not a user error", async () => {
  const f = stubFetch([{ status: 500, body: { error: "boom" } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "sk" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "server" && e.retryable && !(e instanceof ByomUserError)
    );
  } finally {
    f.restore();
  }
});

test("openai: 429 WITH Retry-After → rate_limited (retryable) carrying retryAfterMs", async () => {
  const f = stubFetch([{ status: 429, body: { error: "slow down" }, headers: { "retry-after": "3" } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "sk" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "rate_limited" && e.retryAfterMs === 3000 && e.retryable
    );
    assert.equal(f.calls.length, 1); // no wasted prompt-embed retry on a throttle
  } finally {
    f.restore();
  }
});

test("openai: 429 WITHOUT Retry-After stays a user quota fault (unchanged)", async () => {
  const f = stubFetch([{ status: 429, body: { error: "quota" } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "sk" }, CALL),
      (e) => e instanceof ByomUserError && e.code === "quota"
    );
  } finally {
    f.restore();
  }
});

// ── Anthropic adapter ─────────────────────────────────────────────────────────
test("anthropic: a refusal → typed safety_blocked (NOT retryable, still falls back)", async () => {
  const f = stubFetch([{ status: 200, body: { stop_reason: "refusal", content: [] } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "anthropic", apiKey: "sk-ant" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "safety_blocked" && !e.retryable
    );
  } finally {
    f.restore();
  }
});

test("anthropic: empty content → typed empty error", async () => {
  const f = stubFetch([{ status: 200, body: { content: [] } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "anthropic", apiKey: "sk-ant" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "empty"
    );
  } finally {
    f.restore();
  }
});

// ── Gemini adapter ────────────────────────────────────────────────────────────
test("gemini(byom): empty candidates → typed empty error", async () => {
  const f = stubFetch([{ status: 200, body: { candidates: [] } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "gemini", apiKey: "g" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "empty"
    );
  } finally {
    f.restore();
  }
});

test("gemini(byom): 429 WITH Retry-After → rate_limited, not a hard quota fault", async () => {
  const f = stubFetch([{ status: 429, body: { error: "slow" }, headers: { "retry-after": "1" } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "gemini", apiKey: "g" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "rate_limited" && e.retryAfterMs === 1000
    );
  } finally {
    f.restore();
  }
});

// ── OpenRouter adapter ────────────────────────────────────────────────────────
test("openrouter: malformed content → typed malformed_json", async () => {
  const f = stubFetch([{ status: 200, body: { choices: [{ message: { content: "oops" } }] } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openrouter", apiKey: "or" }, CALL),
      (e) => e instanceof LlmCallError && e.code === "malformed_json"
    );
  } finally {
    f.restore();
  }
});
