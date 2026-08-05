/** pruneToSchema — the wrapper's deterministic contract discipline: prompt-embedded
 *  providers (Claude CLI, BYOM prompt-embed fallback) leak helpful-but-unrequested
 *  fields; the pruner drops anything the schema never declared, recursively, while
 *  leaving open/untyped subtrees alone. Caught live 2026-08-05 by the quality
 *  matrix: `risks`, `severity`, `intent`, `url` extras across four tools. */
import test from "node:test";
import assert from "node:assert/strict";
import { pruneToSchema } from "../src/lib/llm/schema-prune.ts";

const OBJ = (properties) => ({ type: "OBJECT", properties });
const ARR = (items) => ({ type: "ARRAY", items });
const STR = { type: "STRING" };

test("drops top-level keys the schema does not declare", () => {
  const schema = OBJ({ summary: STR, recommendation: STR });
  const out = pruneToSchema({ summary: "s", recommendation: "r", risks: ["extra"], severity: "high" }, schema);
  assert.deepEqual(out, { summary: "s", recommendation: "r" });
});

test("prunes recursively inside arrays of objects (the keyword-clusters `intent` leak)", () => {
  const schema = OBJ({ clusters: ARR(OBJ({ topic: STR, pillar: STR })) });
  const out = pruneToSchema(
    { clusters: [{ topic: "t", pillar: "p", intent: "info" }, { topic: "t2", pillar: "p2" }] },
    schema
  );
  assert.deepEqual(out, { clusters: [{ topic: "t", pillar: "p" }, { topic: "t2", pillar: "p2" }] });
});

test("missing declared keys stay missing (pruning never invents fields)", () => {
  const out = pruneToSchema({ summary: "s" }, OBJ({ summary: STR, recommendation: STR }));
  assert.deepEqual(out, { summary: "s" });
});

test("untyped / open subtrees pass through untouched", () => {
  const schema = OBJ({ payload: {} });
  const value = { payload: { anything: 1, nested: { deep: true } }, extra: "dropped" };
  assert.deepEqual(pruneToSchema(value, schema), { payload: { anything: 1, nested: { deep: true } } });
});

test("non-object values and shape mismatches pass through unchanged", () => {
  const schema = OBJ({ a: STR });
  assert.equal(pruneToSchema("just text", schema), "just text");
  assert.deepEqual(pruneToSchema([1, 2], schema), [1, 2]);
  assert.equal(pruneToSchema(null, schema), null);
  assert.equal(pruneToSchema({ a: "x" }, undefined) instanceof Object, true);
});

test("lower-case google-genai Type enums prune the same (runtime enum value)", () => {
  // @google/genai Type.OBJECT serializes as "OBJECT", but be tolerant of case.
  const schema = { type: "object", properties: { a: STR } };
  assert.deepEqual(pruneToSchema({ a: "x", b: "y" }, schema), { a: "x" });
});
