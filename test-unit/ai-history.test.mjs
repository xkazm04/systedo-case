/** Unit tests for the per-tool generation-history storage helpers
 *  (src/lib/ai/history): legacy single-slot migration, list parsing, version
 *  guard, bounded prepend and roundtrip. Runs the TS source directly via the
 *  shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HISTORY_LIMIT,
  RESULT_SCHEMA_VERSION,
  parseStoredHistory,
  pushHistory,
  serializeHistory,
} from "@/lib/ai/history";

const payload = (n) => ({ result: { n }, meta: { model: "m", demo: false, prompt: "p", tookMs: 1 } });

test("parseStoredHistory returns [] for null / garbage / non-JSON", () => {
  assert.deepEqual(parseStoredHistory(null), []);
  assert.deepEqual(parseStoredHistory("not json"), []);
  assert.deepEqual(parseStoredHistory("42"), []);
  assert.deepEqual(parseStoredHistory("{}"), []);
});

test("parseStoredHistory drops a version-mismatched slot", () => {
  const raw = JSON.stringify({ v: RESULT_SCHEMA_VERSION + 1, savedAt: 5, payload: payload(1) });
  assert.deepEqual(parseStoredHistory(raw), []);
});

test("parseStoredHistory migrates the legacy single-result shape to a one-entry history", () => {
  const raw = JSON.stringify({ v: RESULT_SCHEMA_VERSION, savedAt: 123, payload: payload(1) });
  const entries = parseStoredHistory(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].savedAt, 123);
  assert.deepEqual(entries[0].payload, payload(1));
});

test("parseStoredHistory reads the list shape, skips malformed items, caps at the limit", () => {
  const good = Array.from({ length: HISTORY_LIMIT + 3 }, (_, i) => ({ savedAt: i, payload: payload(i) }));
  const raw = JSON.stringify({
    v: RESULT_SCHEMA_VERSION,
    entries: [null, "junk", { savedAt: "x" }, ...good],
  });
  const entries = parseStoredHistory(raw);
  // the 3 malformed items are dropped; the cap applies to the VALID entries
  assert.equal(entries.length, HISTORY_LIMIT);
  assert.deepEqual(entries[0].payload, payload(0));
});

test("parseStoredHistory coerces a missing savedAt to 0", () => {
  const raw = JSON.stringify({ v: RESULT_SCHEMA_VERSION, entries: [{ payload: payload(7) }] });
  const entries = parseStoredHistory(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].savedAt, 0);
});

test("pushHistory prepends newest-first and evicts the oldest past the cap", () => {
  let entries = [];
  for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
    entries = pushHistory(entries, { savedAt: i, payload: payload(i) });
  }
  assert.equal(entries.length, HISTORY_LIMIT);
  assert.equal(entries[0].savedAt, HISTORY_LIMIT + 1, "newest first");
  assert.equal(entries[entries.length - 1].savedAt, 2, "oldest evicted");
});

test("serializeHistory → parseStoredHistory roundtrips", () => {
  const entries = [
    { savedAt: 2, payload: payload(2) },
    { savedAt: 1, payload: payload(1) },
  ];
  assert.deepEqual(parseStoredHistory(serializeHistory(entries)), entries);
});
