/** `extraction-observability` + the unpriced disclosure.
 *
 *  The JSON-extraction ladder in lib/llm/claude.ts has four rungs and used to
 *  report none of them, so a tool whose model output drifted from "one clean JSON
 *  object" to "prose the balanced-brace scanner has to rescue" looked identical in
 *  telemetry — right up until the rescue stopped working. These assert the rung is
 *  reported, that the untraced facade is unchanged, and that the rollup splits by
 *  promptHash (the contract-version boundary).
 *
 *  Also covers the unpriced counter that every cost total must be read next to.
 *  Pure — no CLI spawn, no Firestore. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { extractJson, extractJsonTraced } = await import("@/lib/llm/claude");
const { countUnpriced, isUnpriced, extractionDistribution } = await import(
  "@/lib/llm/telemetry-stats"
);

test("extractJsonTraced: reports which rung produced the parse", () => {
  assert.deepEqual(extractJsonTraced('{"a":1}'), { value: { a: 1 }, rung: "direct" });

  assert.deepEqual(extractJsonTraced('Tady je výsledek:\n```json\n{"a":2}\n```\n'), {
    value: { a: 2 },
    rung: "fence",
  });

  const envelope = [
    JSON.stringify({ type: "assistant", content: [{ type: "text", text: '{"a":' }] }),
    JSON.stringify({ type: "assistant", content: [{ type: "text", text: "3}" }] }),
  ].join("\n");
  assert.deepEqual(extractJsonTraced(envelope), { value: { a: 3 }, rung: "envelope" });

  assert.deepEqual(extractJsonTraced('Odpověď je {"a":4} a hotovo.'), {
    value: { a: 4 },
    rung: "balanced",
  });
});

test("extractJsonTraced: unparseable output stays null (extraction-failed, not empty-success)", () => {
  assert.equal(extractJsonTraced(""), null);
  assert.equal(extractJsonTraced("   "), null);
  assert.equal(extractJsonTraced("žádný JSON tady není"), null);
});

test("extractJson: the untraced facade returns exactly the value", () => {
  for (const raw of ['{"a":1}', '```json\n{"a":2}\n```', 'x {"a":4} y', "nope"]) {
    const traced = extractJsonTraced(raw);
    assert.deepEqual(extractJson(raw), traced ? traced.value : null);
  }
});

test("extractionDistribution: counts rungs per promptHash, skipping unrecorded ones", () => {
  const dist = extractionDistribution([
    { promptHash: "aaa", extraction: "direct" },
    { promptHash: "aaa", extraction: "direct" },
    { promptHash: "aaa", extraction: "balanced" },
    { promptHash: "bbb", extraction: "fence" },
    // natively-parsed provider / legacy row — contributes to no bucket
    { promptHash: "bbb" },
  ]);
  assert.deepEqual(dist, {
    aaa: { direct: 2, balanced: 1 },
    bbb: { fence: 1 },
  });
  // A window with no rungs at all yields no buckets (not a bucket of zeros).
  assert.deepEqual(extractionDistribution([{ promptHash: "ccc" }]), {});
});

test("isUnpriced/countUnpriced: an absent cost is unknown, an explicit number is priced", () => {
  assert.equal(isUnpriced({ unpriced: true }), true);
  assert.equal(isUnpriced({}), true); // no figure at all
  assert.equal(isUnpriced({ estCostUsd: 0 }), false); // a real, known zero (demo)
  assert.equal(isUnpriced({ estCostUsd: 0.004 }), false);

  assert.equal(
    countUnpriced([{ estCostUsd: 0.01 }, { unpriced: true }, {}, { estCostUsd: 0 }]),
    2
  );
});
