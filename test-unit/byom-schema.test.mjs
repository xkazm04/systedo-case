/** Unit tests for the Google-`Type` → strict-JSON-Schema converter used by the
 *  BYOM OpenAI/Anthropic native-structured-output path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toJsonSchema } from "@/lib/llm/byom/schema.ts";

test("scalars lowercase; object gets additionalProperties + all-required; Google keys dropped", () => {
  const out = toJsonSchema({
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "the title" },
      count: { type: "INTEGER" },
    },
    required: ["title", "count"],
    propertyOrdering: ["title", "count"],
  });
  assert.equal(out.type, "object");
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.required, ["title", "count"]);
  assert.equal(out.properties.title.type, "string");
  assert.equal(out.properties.title.description, "the title");
  assert.equal(out.properties.count.type, "integer");
  assert.equal("propertyOrdering" in out, false);
});

test("an optional source field becomes required-but-nullable", () => {
  const out = toJsonSchema({
    type: "OBJECT",
    properties: { a: { type: "STRING" }, b: { type: "STRING" } },
    required: ["a"], // b is optional in the source
  });
  assert.deepEqual(out.required, ["a", "b"]); // strict: every property required
  assert.equal(out.properties.a.type, "string");
  assert.deepEqual(out.properties.b.type, ["string", "null"]); // optional → nullable
});

test("nested array-of-object recurses (additionalProperties + required at every level)", () => {
  const out = toJsonSchema({
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            heading: { type: "STRING" },
            points: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["heading", "points"],
        },
      },
    },
    required: ["items"],
  });
  assert.equal(out.properties.items.type, "array");
  const item = out.properties.items.items;
  assert.equal(item.type, "object");
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(item.required, ["heading", "points"]);
  assert.equal(item.properties.points.type, "array");
  assert.equal(item.properties.points.items.type, "string");
});

test("enum preserved; a nullable enum gains null; lowercase input is accepted", () => {
  const out = toJsonSchema({
    type: "object", // lowercase also handled
    properties: {
      intent: { type: "string", enum: ["a", "b"] },
      opt: { type: "string", enum: ["x"] },
    },
    required: ["intent"], // opt optional
  });
  assert.equal(out.properties.intent.type, "string");
  assert.deepEqual(out.properties.intent.enum, ["a", "b"]);
  assert.deepEqual(out.properties.opt.type, ["string", "null"]);
  assert.deepEqual(out.properties.opt.enum, ["x", null]);
});
