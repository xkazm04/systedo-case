/** Codex CLI JSONL envelope → one JSON object.
 *
 *  `codex exec --json` has no single-object result mode: it emits JSONL events
 *  and the answer is the text of the LAST `item.completed` event whose item is
 *  an `agent_message` (envelope verified live 2026-08-25, codex-cli 0.139.0).
 *  These assert the envelope walk in lib/llm/codex.ts — including the noise the
 *  real stream carries (bookkeeping events, reasoning items, non-JSON lines) —
 *  and that the extracted message runs through the SAME extraction ladder as
 *  the Claude path. Pure — no CLI spawn, no Firestore. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { codexAgentMessage } = await import("@/lib/llm/codex");
const { extractJsonTraced } = await import("@/lib/llm/claude");

/** A realistic `codex exec --json` stream, per the live 0.139.0 envelope. */
const stream = (agentText) =>
  [
    JSON.stringify({ type: "thread.started", thread_id: "th_1" }),
    JSON.stringify({ type: "turn.started" }),
    // reasoning items are item.completed too — they must NOT be the answer
    JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "reasoning", text: "thinking…" } }),
    JSON.stringify({ type: "item.completed", item: { id: "item_1", type: "agent_message", text: agentText } }),
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 12, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 },
    }),
  ].join("\n");

test("codexAgentMessage: pulls the agent_message text out of the JSONL stream", () => {
  assert.equal(codexAgentMessage(stream('{"a":1}')), '{"a":1}');
});

test("codexAgentMessage: the LAST agent message wins (multi-message turns)", () => {
  const raw = [
    JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: "První průběžná zpráva." } }),
    JSON.stringify({ type: "item.completed", item: { id: "item_1", type: "agent_message", text: '{"a":2}' } }),
  ].join("\n");
  assert.equal(codexAgentMessage(raw), '{"a":2}');
});

test("codexAgentMessage: skips non-JSON noise lines instead of choking on them", () => {
  const raw = [
    "Reading additional input from stdin...",
    'ERROR codex_models_manager::cache: failed to load models cache: missing field "x"',
    stream('{"a":3}'),
    "", // trailing blank line
  ].join("\n");
  assert.equal(codexAgentMessage(raw), '{"a":3}');
});

test("codexAgentMessage: no agent message → null (failed turn is not an empty answer)", () => {
  assert.equal(codexAgentMessage(""), null);
  assert.equal(codexAgentMessage("plain text, no JSONL at all"), null);
  const noAnswer = [
    JSON.stringify({ type: "thread.started", thread_id: "th_2" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({ type: "turn.failed", error: { message: "boom" } }),
  ].join("\n");
  assert.equal(codexAgentMessage(noAnswer), null);
  // an item.completed whose item is NOT an agent message is still not an answer
  assert.equal(
    codexAgentMessage(JSON.stringify({ type: "item.completed", item: { id: "i", type: "command_execution", text: "ls" } })),
    null
  );
});

test("the extracted message rides the shared extraction ladder, rung and all", () => {
  // clean JSON answer → direct rung
  assert.deepEqual(extractJsonTraced(codexAgentMessage(stream('{"a":4}'))), {
    value: { a: 4 },
    rung: "direct",
  });
  // fenced answer (a chatty model) → fence rung, same ladder as the Claude path
  assert.deepEqual(extractJsonTraced(codexAgentMessage(stream('Tady je výsledek:\n```json\n{"a":5}\n```'))), {
    value: { a: 5 },
    rung: "fence",
  });
  // prose around the object → balanced rung
  assert.deepEqual(extractJsonTraced(codexAgentMessage(stream('Odpověď je {"a":6} a hotovo.'))), {
    value: { a: 6 },
    rung: "balanced",
  });
});
