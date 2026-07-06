/** Unit tests for the BYOM provider adapters + error classifier: the
 *  user-fault-vs-recoverable mapping that drives the fallback decision, the model
 *  tier/override resolution, and each vendor adapter's happy path + error surface
 *  (with a mocked fetch — no network, no real key). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ByomUserError, classifyByomHttp } from "@/lib/llm/errors";
import { byomModel } from "@/lib/llm/models";
import { runByom } from "@/lib/llm/byom/adapters.ts";

/** Swap global.fetch for a stub returning `{ status, body }`; returns a restore fn. */
function stubFetch(status, body) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  };
  return { calls, restore: () => (global.fetch = original) };
}

test("classifyByomHttp: user faults vs recoverable", () => {
  assert.equal(classifyByomHttp("openai", 401)?.code, "auth");
  assert.equal(classifyByomHttp("openai", 403)?.code, "permission");
  assert.equal(classifyByomHttp("openai", 402)?.code, "quota");
  assert.equal(classifyByomHttp("openai", 429)?.code, "quota");
  assert.equal(classifyByomHttp("openai", 404)?.code, "model");
  // 400 naming the model is a user model choice; a bare 400 is our request.
  assert.equal(classifyByomHttp("openai", 400, "unknown model gpt-x")?.code, "model");
  assert.equal(classifyByomHttp("openai", 400, "missing field"), null);
  // provider-side / transient → recoverable (null), falls back to the app provider.
  assert.equal(classifyByomHttp("openai", 500), null);
  assert.equal(classifyByomHttp("openai", 529), null);
});

test("byomModel: vendor defaults + per-tier overrides", () => {
  assert.equal(byomModel("anthropic"), "claude-sonnet-5");
  assert.equal(byomModel("anthropic", "fast"), "claude-haiku-4-5");
  assert.equal(byomModel("openai", "quality", "gpt-5"), "gpt-5");
  assert.equal(byomModel("openai", "fast", "gpt-5", "gpt-5-mini"), "gpt-5-mini");
  // an override for the other tier doesn't bleed across tiers
  assert.equal(byomModel("openai", "quality", undefined, "gpt-5-mini"), "gpt-4o");
});

const CALL = { system: "sys", prompt: "make json", schema: { type: "OBJECT" } };

test("runByom openai: happy path parses JSON + usage", async () => {
  const f = stubFetch(200, {
    choices: [{ message: { content: '{"headline":"Ahoj"}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
  try {
    const out = await runByom({ vendor: "openai", apiKey: "sk-test" }, CALL);
    assert.deepEqual(out.parsed, { headline: "Ahoj" });
    assert.equal(out.usage.inputTokens, 10);
    assert.equal(out.usage.outputTokens, 5);
    assert.match(f.calls[0].url, /\/chat\/completions$/);
  } finally {
    f.restore();
  }
});

test("runByom openai: 401 throws a ByomUserError (auth) — user fault", async () => {
  const f = stubFetch(401, { error: { message: "invalid api key" } });
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "bad" }, CALL),
      (e) => e instanceof ByomUserError && e.code === "auth"
    );
  } finally {
    f.restore();
  }
});

test("runByom openai: 500 throws a recoverable Error (not ByomUserError)", async () => {
  const f = stubFetch(500, { error: "boom" });
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "sk" }, CALL),
      (e) => !(e instanceof ByomUserError) && /selhal/.test(e.message)
    );
  } finally {
    f.restore();
  }
});

test("runByom anthropic: parses the text block", async () => {
  const f = stubFetch(200, {
    content: [{ type: "text", text: '{"reply":"Díky"}' }],
    usage: { input_tokens: 3, output_tokens: 4 },
  });
  try {
    const out = await runByom({ vendor: "anthropic", apiKey: "sk-ant" }, CALL);
    assert.deepEqual(out.parsed, { reply: "Díky" });
    assert.equal(out.usage.outputTokens, 4);
    assert.match(f.calls[0].url, /\/v1\/messages$/);
  } finally {
    f.restore();
  }
});

test("runByom anthropic: a refusal is recoverable (falls back, not a user error)", async () => {
  const f = stubFetch(200, { stop_reason: "refusal", content: [] });
  try {
    await assert.rejects(
      () => runByom({ vendor: "anthropic", apiKey: "sk-ant" }, CALL),
      (e) => !(e instanceof ByomUserError) && /refusal/i.test(e.message)
    );
  } finally {
    f.restore();
  }
});

test("runByom gemini: native responseSchema JSON + 429 is a user quota fault", async () => {
  const ok = stubFetch(200, {
    candidates: [{ content: { parts: [{ text: '{"n":3}' }] } }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
  });
  try {
    const out = await runByom({ vendor: "gemini", apiKey: "g-key" }, CALL);
    assert.deepEqual(out.parsed, { n: 3 });
    assert.equal(out.usage.totalTokens, 3);
    assert.match(ok.calls[0].url, /:generateContent\?key=/);
  } finally {
    ok.restore();
  }

  const bad = stubFetch(429, { error: { message: "quota exceeded" } });
  try {
    await assert.rejects(
      () => runByom({ vendor: "gemini", apiKey: "g-key" }, CALL),
      (e) => e instanceof ByomUserError && e.code === "quota"
    );
  } finally {
    bad.restore();
  }
});
