/** Direction 3 — the gate keys on the whole truth. `sampleLessonsAllowed` decides
 *  whether demo-derived sample lessons may enter a tenant's PROMPT: only on the demo /
 *  anonymous surface. A REAL authenticated tenant — live OR never-synced — excludes
 *  them (closing the never-synced false-framing hole), so getPatternLines needs no
 *  sync-meta read. Pure; four tenant states + the byte-identical live/demo composition. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleLessonsAllowed, promptSafePatterns, sampleLessonPatterns } from "@/lib/patterns/extract";
import { DEMO_PROJECTS } from "@/lib/demo/projects";

const DEMO_ID = DEMO_PROJECTS[0].id; // e.g. "demo-eshop"
const REAL_TENANT = "u_abc_proj_xyz_123"; // a per-project real tenant key
const REAL_PROJECT = "xyz"; // a non-demo project id

// --- four tenant states -------------------------------------------------------

test("anonymous visitor (shared `sample` tenant) → sample lessons ALLOWED", () => {
  assert.equal(sampleLessonsAllowed("sample", undefined), true);
  assert.equal(sampleLessonsAllowed("sample", REAL_PROJECT), true); // anon wins regardless of id
});

test("a public DEMO project → sample lessons ALLOWED (even for a signed-in tenant)", () => {
  assert.equal(sampleLessonsAllowed(REAL_TENANT, DEMO_ID), true);
});

test("REAL tenant, never-synced → sample lessons EXCLUDED (the false-framing fix)", () => {
  // Never-synced (null sync meta) used to read as "not live" and KEEP sample lessons,
  // framing demo lessons as the account's own wins. Now excluded.
  assert.equal(sampleLessonsAllowed(REAL_TENANT, REAL_PROJECT), false);
});

test("REAL tenant, live → sample lessons EXCLUDED (unchanged) — same verdict as never-synced", () => {
  // The policy no longer depends on sync state: a real account excludes sample lessons
  // whether it is live-synced or never-synced. That collapse is the whole point.
  assert.equal(sampleLessonsAllowed(REAL_TENANT, REAL_PROJECT), false);
});

// --- live/demo behavior byte-identical via the prompt gate --------------------

test("demo/anon composition keeps sample lessons; real strips them (byte-identical to old live/demo)", () => {
  const manual = {
    id: "m1",
    title: "Ruční vzor",
    category: "structure",
    insight: "…",
    evidence: "…",
    source: "manual",
    createdAt: "",
  };
  const all = [manual, ...sampleLessonPatterns()];

  // demo/anon → allowed → excludeSample=false → keep everything (old demo behavior).
  const demoAllowed = sampleLessonsAllowed("sample", undefined);
  assert.deepEqual(promptSafePatterns(all, !demoAllowed), all);

  // real tenant → not allowed → excludeSample=true → strip sample lessons (old live behavior).
  const realAllowed = sampleLessonsAllowed(REAL_TENANT, REAL_PROJECT);
  const safe = promptSafePatterns(all, !realAllowed);
  const sampleIds = new Set(sampleLessonPatterns().map((p) => p.id));
  assert.ok(safe.some((p) => p.id === manual.id), "the manual save survives");
  assert.ok(safe.every((p) => !sampleIds.has(p.id)), "every sample lesson stripped for a real tenant");
});
