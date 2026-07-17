/** parsePersistedTwin: the twin read-path guard. A malformed persisted blob (a
 *  legacy schema missing arrays, a hand-edited doc) must self-heal to a clean
 *  bounded TwinState rather than crash `resolveTwin` outside its try/catch. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePersistedTwin } from "@/lib/twin/persisted";

test("parsePersistedTwin: non-JSON returns null", () => {
  assert.equal(parsePersistedTwin("not json"), null);
  assert.equal(parsePersistedTwin(""), null);
});

test("parsePersistedTwin: a legacy blob missing arrays coerces to empty arrays (no throw)", () => {
  // A blob saved before `drafts`/`channels`/`facts` existed — the exact shape that
  // used to reach mergeVoices/`saved.channels.length` and throw a TypeError.
  const s = parsePersistedTwin(JSON.stringify({ voices: [{ scope: "generic", tone: "warm" }] }));
  assert.ok(s, "returns a state, never null, for well-formed JSON");
  assert.ok(Array.isArray(s.channels));
  assert.ok(Array.isArray(s.drafts));
  assert.ok(Array.isArray(s.facts));
  assert.equal(s.drafts.length, 0);
  assert.equal(s.channels.length, 0);
});

test("parsePersistedTwin: junk arrays and drafts are sanitized, not trusted", () => {
  const s = parsePersistedTwin(
    JSON.stringify({
      voices: "nope",
      channels: 42,
      facts: null,
      drafts: [{ channel: "email", reply: "hi", status: "sent" }, { garbage: true }],
    })
  );
  assert.deepEqual(s.voices, []);
  assert.deepEqual(s.channels, []);
  assert.deepEqual(s.facts, []);
  // the replyless/garbage draft is dropped; the valid one survives
  assert.equal(s.drafts.length, 1);
  assert.equal(s.drafts[0].reply, "hi");
});

test("parsePersistedTwin: preserves a string updatedAt (dropped by sanitize)", () => {
  const ts = "2026-07-16T00:00:00.000Z";
  const s = parsePersistedTwin(JSON.stringify({ voices: [], channels: [], facts: [], drafts: [], updatedAt: ts }));
  assert.equal(s.updatedAt, ts);
  // a non-string updatedAt is not carried through
  const s2 = parsePersistedTwin(JSON.stringify({ updatedAt: 123 }));
  assert.equal(s2.updatedAt, undefined);
});
