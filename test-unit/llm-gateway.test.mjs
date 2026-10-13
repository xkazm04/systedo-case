/** The LightTrack gateway transport (src/lib/llm/gateway.ts): the pure halves — request shape,
 *  route discovery, completion parsing, error mapping — without an HTTP call. The wrapper hook
 *  (gateway-served tools skip the in-app ladder) is covered end to end by the gateway drill in
 *  docs/LLM_ROUTES.md; here we pin the contract the drill relies on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGatewayRequest,
  gatewayError,
  gatewayRouteFor,
  gatewayUrl,
  parseGatewayCompletion,
  resetGatewayRoutes,
  routeIdsFrom,
} from "@/lib/llm/gateway";

const SCHEMA = {
  type: "OBJECT",
  properties: { summary: { type: "STRING" }, likelyCause: { type: "STRING" }, severity: { type: "STRING" } },
  required: ["summary", "likelyCause"],
};

test("request: model is the route, schema rides as strict json_schema, system+user turns", () => {
  const body = buildGatewayRequest({ route: "lead-source-diagnosis", system: "S", prompt: "P", schema: SCHEMA });
  assert.equal(body.model, "lead-source-diagnosis");
  assert.deepEqual(
    body.messages.map((m) => m.role),
    ["system", "user"]
  );
  assert.equal(body.response_format.type, "json_schema");
  const schema = body.response_format.json_schema.schema;
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  // strict mode: every property listed as required; the optional one made nullable
  assert.deepEqual(schema.required, ["summary", "likelyCause", "severity"]);
  assert.deepEqual(schema.properties.severity.type, ["string", "null"]);
});

test("route discovery: OpenAI list shape and a bare array both yield route ids", () => {
  assert.deepEqual([...routeIdsFrom({ object: "list", data: [{ id: "a" }, { id: "b" }] })], ["a", "b"]);
  assert.deepEqual([...routeIdsFrom(["x", { id: "y" }])], ["x", "y"]);
  assert.deepEqual([...routeIdsFrom(null)], []);
});

test("gatewayRouteFor is null when LLM_GATEWAY_URL is unset (transport off)", async () => {
  const prev = process.env.LLM_GATEWAY_URL;
  delete process.env.LLM_GATEWAY_URL;
  resetGatewayRoutes();
  try {
    assert.equal(gatewayUrl(), undefined);
    assert.equal(await gatewayRouteFor("lead-source-diagnosis"), null);
  } finally {
    if (prev !== undefined) process.env.LLM_GATEWAY_URL = prev;
  }
});

test("gatewayUrl strips a trailing slash so paths join cleanly", () => {
  const prev = process.env.LLM_GATEWAY_URL;
  process.env.LLM_GATEWAY_URL = "http://127.0.0.1:8791/v1/";
  try {
    assert.equal(gatewayUrl(), "http://127.0.0.1:8791/v1");
  } finally {
    if (prev === undefined) delete process.env.LLM_GATEWAY_URL;
    else process.env.LLM_GATEWAY_URL = prev;
  }
});

test("completion: headers name the seat that answered and whether it fell back", () => {
  const headers = new Map([
    ["x-lighttrack-served-by", "codex/gpt-5.5@low"],
    ["x-lighttrack-fell-back", "1"],
  ]);
  const body = {
    model: "codex/gpt-5.5@low",
    choices: [{ message: { role: "assistant", content: '{"summary":"s","likelyCause":"spam","recommendation":"r"}' } }],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
    lighttrack: { served_by: "codex/gpt-5.5@low", fell_back: true, cost_usd: null },
  };
  const c = parseGatewayCompletion(body, { get: (k) => headers.get(k) ?? null });
  assert.equal(c.servedBy, "codex/gpt-5.5@low");
  assert.equal(c.fellBack, true);
  assert.equal(c.costUsd, null); // a seat reports no $ — unpriced, never 0
  assert.deepEqual(c.usage, { inputTokens: 900, outputTokens: 120, totalTokens: 1020 });
  assert.equal(JSON.parse(c.text).likelyCause, "spam");
});

test("completion: without headers the body's lighttrack block is the source of truth", () => {
  const body = {
    model: "anthropic/sonnet@low",
    choices: [{ message: { content: "{}" } }],
    lighttrack: { served_by: "anthropic/sonnet@low", fell_back: false, cost_usd: 0.021 },
  };
  const c = parseGatewayCompletion(body, { get: () => null });
  assert.equal(c.servedBy, "anthropic/sonnet@low");
  assert.equal(c.fellBack, false);
  assert.equal(c.costUsd, 0.021);
  assert.equal(c.usage, undefined);
});

test("errors: 503 with Retry-After and 429 are rate_limited; 502 is server; 400 is never retried", () => {
  const held = gatewayError(503, { error: { message: "every target failed" } }, "120");
  assert.equal(held.code, "rate_limited");
  assert.equal(held.retryAfterMs, 120_000);
  assert.equal(held.status, 503);
  assert.match(held.message, /503/);

  const admission = gatewayError(429, { error: { message: "limit breached" } }, null);
  assert.equal(admission.code, "rate_limited");
  assert.equal(admission.retryAfterMs, undefined);

  assert.equal(gatewayError(502, null, null).code, "server");
  const bad = gatewayError(400, { error: { message: "tools are not supported" } }, null);
  assert.equal(bad.code, "unknown");
  assert.equal(bad.retryable, false);
});
