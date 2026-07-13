/** Real producers for the previously-empty `creative` and `targeting` pattern
 *  categories (src/lib/patterns/extract.ts). `mineCreativePatterns` turns a WON
 *  landing-page experiment into a creative angle (only a statistically significant
 *  winner over control is mined); `mineTargetingPatterns` turns per-channel CTR
 *  outliers from the distribution learnings into targeting lessons. Both are pure —
 *  tested here with fixture data, no store. Zero source data → zero patterns. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mineCreativePatterns,
  mineTargetingPatterns,
  minePatterns,
  promptSafePatterns,
  sampleLessonPatterns,
} from "@/lib/patterns/extract";

const titles = (ps) => ps.map((p) => p.title);
const cat = (ps, c) => ps.filter((p) => p.category === c);

// --- creative miner ----------------------------------------------------------

/** A `done` experiment whose challenger B beats control by a wide margin at large
 *  n — evaluate() reads it as a statistically significant winner. */
const wonExperiment = () => ({
  id: "exp-x",
  cluster: "projektové řízení nástroj",
  status: "done",
  variants: [
    { label: "A · Kontrola", visitors: 4200, signups: 176 },
    { label: "B · Důraz na šablony", visitors: 4180, signups: 231 },
  ],
});

test("creative: a won LP variant becomes a creative pattern with the real CVR jump", () => {
  const out = mineCreativePatterns([wonExperiment()]);
  assert.equal(out.length, 1);
  const p = out[0];
  assert.equal(p.category, "creative");
  assert.equal(p.source, "auto");
  // Title carries the tested angle (label prefix "B · " stripped) + the cluster.
  assert.ok(p.title.includes("Důraz na šablony"), "title names the winning angle");
  assert.ok(p.title.includes("projektové řízení"), "title names the cluster");
  // Insight renders the control→winner conversion jump (4.19 % → 5.53 %).
  assert.match(p.insight, /Hypotéza/);
  assert.match(p.insight, /4,\d+\s*%/); // control CVR
  assert.match(p.insight, /5,\d+\s*%/); // winner CVR
  // Evidence carries the uplift + confidence.
  assert.match(p.evidence, /kontrola/);
});

test("creative: stable id derives from the title (same input → same id)", () => {
  const a = mineCreativePatterns([wonExperiment()])[0];
  const b = mineCreativePatterns([wonExperiment()])[0];
  assert.equal(a.id, b.id);
  assert.match(a.id, /^[0-9a-f]{16}$/);
});

test("creative: an inconclusive / running experiment yields no pattern (zero data → zero)", () => {
  // Tiny n, small lift — never clears significance.
  const inconclusive = {
    id: "exp-y",
    cluster: "malý vzorek",
    status: "running",
    variants: [
      { label: "A · Kontrola", visitors: 120, signups: 6 },
      { label: "B · Jiný nadpis", visitors: 118, signups: 7 },
    ],
  };
  assert.deepEqual(mineCreativePatterns([inconclusive]), []);
  assert.deepEqual(mineCreativePatterns([]), []);
});

// --- targeting miner ---------------------------------------------------------

/** Four channels: Newsletter over-performs (15 % CTR), Instagram trails (4 %),
 *  the rest sit near the middle. */
const channels = () => [
  { channel: "Newsletter", reach: 8400, clicks: 1260 }, // 15.0 %
  { channel: "LinkedIn", reach: 5200, clicks: 364 }, //  7.0 %
  { channel: "Instagram", reach: 11800, clicks: 472 }, //  4.0 %
  { channel: "X / Twitter", reach: 3100, clicks: 186 }, //  6.0 %
];

test("targeting: CTR outliers become over- and under-performing channel patterns", () => {
  const out = mineTargetingPatterns(channels());
  assert.ok(out.every((p) => p.category === "targeting"));
  const t = titles(out);
  assert.ok(t.some((x) => x.includes("Nadvýkonný") && x.includes("Newsletter")), "over-performer = Newsletter");
  assert.ok(t.some((x) => x.includes("Podvýkonný") && x.includes("Instagram")), "under-performer = Instagram");
  const over = out.find((p) => p.title.includes("Nadvýkonný"));
  assert.match(over.evidence, /CTR/);
  assert.match(over.evidence, /průměr ostatních/);
});

test("targeting: stable ids; auto source", () => {
  const a = mineTargetingPatterns(channels());
  const b = mineTargetingPatterns(channels());
  assert.deepEqual(titles(a), titles(b));
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.ok(a.every((p) => p.source === "auto" && /^[0-9a-f]{16}$/.test(p.id)));
});

test("targeting: fewer than 3 channels → no patterns (peers not meaningful)", () => {
  assert.deepEqual(mineTargetingPatterns(channels().slice(0, 2)), []);
  assert.deepEqual(mineTargetingPatterns([]), []);
});

test("targeting: channels all at the same CTR → no outlier patterns", () => {
  const flat = [
    { channel: "A", reach: 1000, clicks: 50 },
    { channel: "B", reach: 2000, clicks: 100 },
    { channel: "C", reach: 3000, clicks: 150 },
  ]; // all 5 % CTR
  assert.deepEqual(mineTargetingPatterns(flat), []);
});

test("both miners emit into the two categories the taxonomy previously never produced", () => {
  const creative = mineCreativePatterns([wonExperiment()]);
  const targeting = mineTargetingPatterns(channels());
  assert.ok(cat(creative, "creative").length > 0);
  assert.ok(cat(targeting, "targeting").length > 0);
});

// --- prompt integrity: sample lessons never masquerade as live-account wins ---

test("sampleLessonPatterns: demo-derived lessons carry the honest suffix and both categories", () => {
  const lessons = sampleLessonPatterns();
  assert.ok(cat(lessons, "creative").length > 0, "creative lesson mined from the sample");
  assert.ok(cat(lessons, "targeting").length > 0, "targeting lessons mined from the sample");
  assert.ok(lessons.every((p) => p.insight.endsWith("(ukázková lekce)")), "insight labeled as a sample lesson");
  assert.ok(lessons.every((p) => p.source === "auto"));
});

/** A live-campaigns fixture (the same ROAS-7 campaign the target test uses) —
 *  what getPatternLines assembles for a live tenant before the gate. */
const liveMined = () =>
  minePatterns(
    [
      {
        id: "c1",
        name: "Search generic",
        type: "search",
        status: "enabled",
        impressions: 100_000,
        clicks: 2_000,
        cost: 10_000,
        conversions: 40,
        conversionValue: 70_000,
      },
    ],
    {}
  );

test("live tenant: promptSafePatterns strips the sample lessons, keeps mined + manual", () => {
  const manual = {
    id: "abc123manual",
    title: "Vlastní poučka",
    category: "creative",
    insight: "Ručně uložená lekce.",
    evidence: "",
    source: "manual",
    createdAt: "2026-07-13T00:00:00.000Z",
  };
  const all = [manual, ...liveMined(), ...sampleLessonPatterns()];
  const safe = promptSafePatterns(all, true);
  // Every demo-derived lesson is gone…
  const sampleIds = new Set(sampleLessonPatterns().map((p) => p.id));
  assert.ok(safe.every((p) => !sampleIds.has(p.id)), "no sample lesson survives for a live tenant");
  assert.ok(!safe.some((p) => p.insight.includes("ukázková lekce")));
  // …while the tenant's own mined patterns and manual saves are untouched.
  assert.deepEqual(safe, [manual, ...liveMined()]);
});

test("sample tenant: promptSafePatterns keeps the sample lessons (whole surface is illustrative)", () => {
  const all = [...liveMined(), ...sampleLessonPatterns()];
  assert.deepEqual(promptSafePatterns(all, false), all);
});
