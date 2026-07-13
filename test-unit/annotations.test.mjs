/** Direction 2 — report annotations: the pure sanitizers / state transitions / event
 *  mapping / grounding-window filter, the sqlite store roundtrip (cap enforced in
 *  both backends via the shared dispatcher), and the resolve seam (a live dataset
 *  gets its events built from the project's annotations). Exercises the `annotations`
 *  table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// The resolver transitively imports @/data/performance.json — register the JSON hook.
register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), "systedo-annotations-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const {
  sanitizeAnnotationInput,
  addAnnotation,
  removeAnnotation,
  annotationsInWindow,
  annotationsToEvents,
  annotationsGroundingText,
  ANNOTATION_CAP,
  ANNOTATION_TEXT_MAX,
} = await import("@/lib/annotations/types");
const { recordAnnotation, listAnnotations, deleteAnnotation, clearAnnotations } = await import("@/lib/annotations/store");
const { saveReportMetrics, clearReportMetrics } = await import("@/lib/report-metrics/store");
const { resolveReportDataset } = await import("@/lib/report-metrics/resolve");

// --- sanitizer ------------------------------------------------------------

test("sanitize: accepts a valid dated note, trims + caps text", () => {
  assert.deepEqual(sanitizeAnnotationInput({ date: "2026-06-10", text: "  TV kampaň  " }), {
    date: "2026-06-10",
    text: "TV kampaň",
  });
  const long = sanitizeAnnotationInput({ date: "2026-06-10", text: "x".repeat(500) });
  assert.equal(long.text.length, ANNOTATION_TEXT_MAX);
});

test("sanitize: rejects blank text and malformed / impossible dates", () => {
  assert.equal(sanitizeAnnotationInput({ date: "2026-06-10", text: "   " }), null);
  assert.equal(sanitizeAnnotationInput({ date: "2026-13-40", text: "x" }), null);
  assert.equal(sanitizeAnnotationInput({ date: "06/10/2026", text: "x" }), null);
  assert.equal(sanitizeAnnotationInput({ text: "x" }), null);
  assert.equal(sanitizeAnnotationInput(null), null);
});

// --- state transitions ----------------------------------------------------

test("addAnnotation: prepends newest-first, stamps id + createdAt", () => {
  const now = new Date("2026-06-11T09:00:00Z");
  const s1 = addAnnotation(null, { date: "2026-06-01", text: "a" }, now);
  const s2 = addAnnotation(s1, { date: "2026-06-05", text: "b" }, now);
  assert.equal(s2.items.length, 2);
  assert.equal(s2.items[0].text, "b"); // newest first
  assert.ok(s2.items[0].id);
  assert.equal(s2.items[0].createdAt, now.toISOString());
});

test("addAnnotation: caps at ANNOTATION_CAP, dropping the OLDEST (honest truncation)", () => {
  let state = null;
  for (let i = 0; i < ANNOTATION_CAP + 10; i++) {
    state = addAnnotation(state, { date: "2026-06-01", text: `note-${i}` }, new Date());
  }
  assert.equal(state.items.length, ANNOTATION_CAP);
  // The most recently added survive; the oldest (note-0..note-9) are gone.
  assert.equal(state.items[0].text, `note-${ANNOTATION_CAP + 9}`);
  assert.ok(!state.items.some((a) => a.text === "note-0"));
});

test("removeAnnotation: reports found / not-found", () => {
  const s = addAnnotation(null, { date: "2026-06-01", text: "a" }, new Date());
  const id = s.items[0].id;
  assert.equal(removeAnnotation(s, "nope").found, false);
  const gone = removeAnnotation(s, id);
  assert.equal(gone.found, true);
  assert.equal(gone.state.items.length, 0);
});

// --- window + event mapping ----------------------------------------------

test("annotationsInWindow: inclusive [from,to] by date string", () => {
  const items = [
    { id: "1", date: "2026-05-30", text: "before", createdAt: "" },
    { id: "2", date: "2026-06-01", text: "edge-lo", createdAt: "" },
    { id: "3", date: "2026-06-15", text: "in", createdAt: "" },
    { id: "4", date: "2026-06-30", text: "edge-hi", createdAt: "" },
    { id: "5", date: "2026-07-01", text: "after", createdAt: "" },
  ];
  assert.deepEqual(
    annotationsInWindow(items, "2026-06-01", "2026-06-30").map((a) => a.text),
    ["edge-lo", "in", "edge-hi"]
  );
});

test("annotationsToEvents: maps to the PerformanceEvent shape, sorted, kind=milestone", () => {
  const events = annotationsToEvents([
    { id: "1", date: "2026-06-15", text: "later", createdAt: "" },
    { id: "2", date: "2026-06-01", text: "earlier", createdAt: "" },
  ]);
  assert.deepEqual(events, [
    { date: "2026-06-01", label: "earlier", kind: "milestone" },
    { date: "2026-06-15", label: "later", kind: "milestone" },
  ]);
});

// --- grounding ------------------------------------------------------------

const DATA = { daily: [{ date: "2026-05-01" }, { date: "2026-06-30" }] };

test("annotationsGroundingText: empty when no notes or no data", () => {
  assert.equal(annotationsGroundingText([], DATA, 90, "cs"), "");
  assert.equal(annotationsGroundingText([{ id: "1", date: "2026-06-01", text: "x", createdAt: "" }], undefined, 90, "cs"), "");
});

test("annotationsGroundingText: only in-window notes, dated, both locales", () => {
  const items = [
    { id: "1", date: "2026-06-20", text: "spustili jsme TV kampaň", createdAt: "" }, // in 90d window ending 2026-06-30
    { id: "2", date: "2026-01-01", text: "loni", createdAt: "" }, // out of window
  ];
  const cs = annotationsGroundingText(items, DATA, 90, "cs");
  assert.match(cs, /Poznámky klienta/);
  assert.match(cs, /2026-06-20: spustili jsme TV kampaň/);
  assert.ok(!cs.includes("loni"));
  const en = annotationsGroundingText(items, DATA, 90, "en");
  assert.match(en, /Client notes/);
});

// --- store roundtrip (LOCAL sqlite backend) -------------------------------

test("store: record → list → delete roundtrip", async () => {
  const pid = "proj-annot-1";
  await clearAnnotations(pid);
  await recordAnnotation(pid, { date: "2026-06-10", text: "first" });
  const items = await recordAnnotation(pid, { date: "2026-06-12", text: "second" });
  assert.equal(items.length, 2);
  assert.equal(items[0].text, "second"); // newest-first
  const listed = await listAnnotations(pid);
  assert.equal(listed.length, 2);
  assert.equal(await deleteAnnotation(pid, listed[0].id), true);
  assert.equal(await deleteAnnotation(pid, "unknown"), false);
  assert.equal((await listAnnotations(pid)).length, 1);
});

test("store: cap is enforced through the dispatcher", async () => {
  const pid = "proj-annot-cap";
  await clearAnnotations(pid);
  for (let i = 0; i < ANNOTATION_CAP + 5; i++) {
    await recordAnnotation(pid, { date: "2026-06-10", text: `n-${i}` });
  }
  assert.equal((await listAnnotations(pid)).length, ANNOTATION_CAP);
});

// --- resolve seam ---------------------------------------------------------

const PROJECT = { id: "proj-annot-seam", name: "Acme s.r.o.", type: "eshop", domain: "acme.cz" };

test("resolve seam: a live dataset's events are built from the project's annotations", async () => {
  await clearAnnotations(PROJECT.id);
  await recordAnnotation(PROJECT.id, { date: "2026-06-02", text: "nová landing page" });
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1234567890", syncedAt: new Date().toISOString(), days: 400, rowCount: 2 },
    rows: [
      { date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 },
      { date: "2026-06-02", visits: 13, cost: 2, conversions: 3, revenue: 4800 },
    ],
  });
  const res = await resolveReportDataset(PROJECT);
  assert.equal(res.live, true);
  assert.ok(Array.isArray(res.data.events));
  assert.equal(res.data.events.length, 1);
  assert.deepEqual(res.data.events[0], { date: "2026-06-02", label: "nová landing page", kind: "milestone" });
  await clearReportMetrics(PROJECT.id);
  await clearAnnotations(PROJECT.id);
});

test("resolve seam: no annotations → events stay undefined (no fabricated markers)", async () => {
  await clearAnnotations(PROJECT.id);
  await saveReportMetrics(PROJECT.id, {
    meta: { source: "google-ads", customerId: "1", syncedAt: new Date().toISOString(), days: 400, rowCount: 1 },
    rows: [{ date: "2026-06-01", visits: 5, cost: 1, conversions: 1, revenue: 1200 }],
  });
  const res = await resolveReportDataset(PROJECT);
  assert.equal(res.data.events, undefined);
  await clearReportMetrics(PROJECT.id);
});
