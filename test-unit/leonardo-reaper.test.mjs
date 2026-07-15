/** Fixture tests for the Leonardo generation reaper decision: an unsaved
 *  generation past the grace window is reapable; a saved winner's generation is
 *  kept at ANY age (its cloud image must survive for a nobg re-derivation); a
 *  fresh generation is kept until it ages out. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generationsToReap, DEFAULT_GRACE_MS } from "@/lib/images/reaper-core.ts";

const NOW = new Date("2026-07-15T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("reaps an unsaved generation older than the grace window", () => {
  const records = [{ generationId: "old-unsaved", createdAt: hoursAgo(72) }];
  const reap = generationsToReap(records, new Set(), NOW, DEFAULT_GRACE_MS);
  assert.deepEqual(reap, ["old-unsaved"]);
});

test("keeps a fresh generation still inside the grace window", () => {
  const records = [{ generationId: "fresh", createdAt: hoursAgo(2) }];
  assert.deepEqual(generationsToReap(records, new Set(), NOW, DEFAULT_GRACE_MS), []);
});

test("NEVER reaps a saved winner's generation, even when ancient (nobg must survive)", () => {
  const records = [{ generationId: "gen-winner", createdAt: hoursAgo(24 * 30) }];
  const referenced = new Set(["gen-winner"]);
  assert.deepEqual(generationsToReap(records, referenced, NOW, DEFAULT_GRACE_MS), []);
});

test("mixed batch: only the aged-out, unreferenced ones are reaped", () => {
  const records = [
    { generationId: "old-unsaved", createdAt: hoursAgo(72) },
    { generationId: "old-saved", createdAt: hoursAgo(72) },
    { generationId: "fresh-unsaved", createdAt: hoursAgo(1) },
  ];
  const referenced = new Set(["old-saved"]);
  const reap = generationsToReap(records, referenced, NOW, DEFAULT_GRACE_MS);
  assert.deepEqual(reap, ["old-unsaved"]);
});

test("never reaps on missing / unparseable provenance", () => {
  const records = [
    { generationId: "no-date", createdAt: "" },
    { generationId: "bad-date", createdAt: "not-a-date" },
  ];
  assert.deepEqual(generationsToReap(records, new Set(), NOW, DEFAULT_GRACE_MS), []);
});

test("skips empty generationId rows", () => {
  const records = [{ generationId: "", createdAt: hoursAgo(72) }];
  assert.deepEqual(generationsToReap(records, new Set(), NOW, DEFAULT_GRACE_MS), []);
});

test("grace boundary is exclusive: exactly-at-grace is kept, a hair older reaps", () => {
  const atGrace = [{ generationId: "at", createdAt: new Date(NOW.getTime() - DEFAULT_GRACE_MS).toISOString() }];
  assert.deepEqual(generationsToReap(atGrace, new Set(), NOW, DEFAULT_GRACE_MS), []);
  const older = [{ generationId: "older", createdAt: new Date(NOW.getTime() - DEFAULT_GRACE_MS - 1000).toISOString() }];
  assert.deepEqual(generationsToReap(older, new Set(), NOW, DEFAULT_GRACE_MS), ["older"]);
});
