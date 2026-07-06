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

/** Stub fetch that returns a different response per call (by index). */
function stubFetchSeq(responses) {
  const original = global.fetch;
  const calls = [];
  let i = 0;
  global.fetch = async (url, opts) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    calls.push({ url, opts });
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
      text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
    };
  };
  return { calls, restore: () => (global.fetch = original) };
}

test("runByom openai: a recoverable structured 400 falls back to prompt-embed", async () => {
  const f = stubFetchSeq([
    { status: 400, body: { error: { message: "response_format not supported here" } } },
    { status: 200, body: { choices: [{ message: { content: '{"ok":1}' } }], usage: {} } },
  ]);
  try {
    const out = await runByom({ vendor: "openai", apiKey: "sk" }, CALL);
    assert.deepEqual(out.parsed, { ok: 1 });
    assert.equal(f.calls.length, 2); // structured attempt, then the prompt-embed retry
    const body1 = JSON.parse(f.calls[0].opts.body);
    assert.equal(body1.response_format.type, "json_schema"); // first tried native structured output
    const body2 = JSON.parse(f.calls[1].opts.body);
    assert.equal("response_format" in body2, false); // fallback drops the structured param
    assert.match(body2.messages[1].content, /JSON/); // and embeds the schema in the prompt
  } finally {
    f.restore();
  }
});

test("runByom openai: a structured user fault (401) surfaces with no wasted retry", async () => {
  const f = stubFetchSeq([{ status: 401, body: { error: "bad key" } }]);
  try {
    await assert.rejects(
      () => runByom({ vendor: "openai", apiKey: "bad" }, CALL),
      (e) => e instanceof ByomUserError && e.code === "auth"
    );
    assert.equal(f.calls.length, 1); // no prompt-embed fallback on a user fault
  } finally {
    f.restore();
  }
});

test("runByom anthropic: native structured request carries output_config, then falls back", async () => {
  const f = stubFetchSeq([
    { status: 400, body: { error: { type: "invalid_request_error", message: "output_config unsupported" } } },
    { status: 200, body: { content: [{ type: "text", text: '{"reply":"ok"}' }], usage: {} } },
  ]);
  try {
    const out = await runByom({ vendor: "anthropic", apiKey: "sk-ant" }, CALL);
    assert.deepEqual(out.parsed, { reply: "ok" });
    const body1 = JSON.parse(f.calls[0].opts.body);
    assert.equal(body1.output_config.format.type, "json_schema");
    const body2 = JSON.parse(f.calls[1].opts.body);
    assert.equal("output_config" in body2, false);
  } finally {
    f.restore();
  }
});
