/** Direction 1 — LP experiments become real: the pure sanitizers / state transitions,
 *  the sqlite store roundtrip (cap enforced via the shared dispatcher), the resolve seam
 *  (persisted experiments render over the sample), and the LIVE creative-pattern mining
 *  handoff (a real significant winner mines a pattern that passes the live-tenant prompt
 *  gate, while the demo sample lessons are still stripped). Exercises the `lp_experiments`
 *  table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-lp-experiments-test.db");
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
  sanitizeVariant,
  sanitizeExperimentInput,
  addExperiment,
  replaceExperiment,
  removeExperiment,
  EXPERIMENT_CAP,
  VARIANT_MIN,
  VARIANT_MAX,
} = await import("@/lib/lp-exp/types");
const { createExperiment, updateExperiment, deleteExperiment, listExperiments, clearExperiments } =
  await import("@/lib/lp-exp/store");
const { resolveExperiments } = await import("@/lib/lp-exp/resolve");
const { extractExperimentPatterns, promptSafePatterns, sampleLessonPatterns } =
  await import("@/lib/patterns/extract");

// --- sanitizers ---------------------------------------------------------------

test("sanitizeVariant: clamps signups to visitors and coerces non-negative ints", () => {
  const v = sanitizeVariant({ label: "  B · X  ", visitors: "4200.9", signups: 99999 }, 1);
  assert.equal(v.label, "B · X");
  assert.equal(v.visitors, 4200);
  assert.equal(v.signups, 4200); // signups can't exceed visitors
  const neg = sanitizeVariant({ label: "A", visitors: -5, signups: -1 });
  assert.equal(neg.visitors, 0);
  assert.equal(neg.signups, 0);
  assert.equal(sanitizeVariant(null), null);
  assert.equal(sanitizeVariant("x"), null);
});

test("sanitizeExperimentInput: requires a cluster + ≥2 variants, defaults status running", () => {
  const ok = sanitizeExperimentInput({
    cluster: "  CRM zdarma  ",
    variants: [
      { label: "A", visitors: 100, signups: 5 },
      { label: "B", visitors: 100, signups: 9 },
    ],
  });
  assert.equal(ok.cluster, "CRM zdarma");
  assert.equal(ok.status, "running");
  assert.equal(ok.variants.length, 2);

  // blank cluster / too few variants → null
  assert.equal(sanitizeExperimentInput({ cluster: "", variants: [{ label: "A", visitors: 1 }, { label: "B", visitors: 1 }] }), null);
  assert.equal(sanitizeExperimentInput({ cluster: "x", variants: [{ label: "A", visitors: 1 }] }), null);
  assert.equal(sanitizeExperimentInput(null), null);

  // status honoured; variants capped at VARIANT_MAX
  const many = sanitizeExperimentInput({
    cluster: "c",
    status: "done",
    variants: Array.from({ length: VARIANT_MAX + 3 }, (_, i) => ({ label: `V${i}`, visitors: 10, signups: 1 })),
  });
  assert.equal(many.status, "done");
  assert.equal(many.variants.length, VARIANT_MAX);
  assert.ok(VARIANT_MIN === 2);
});

// --- pure state transitions ---------------------------------------------------

test("addExperiment: prepends newest-first and caps to EXPERIMENT_CAP", () => {
  let state = null;
  const idOf = (() => {
    let n = 0;
    return () => `id-${n++}`;
  })();
  for (let i = 0; i < EXPERIMENT_CAP + 5; i++) {
    ({ state } = addExperiment(state, { cluster: `c${i}`, status: "running", variants: [] }, idOf));
  }
  assert.equal(state.items.length, EXPERIMENT_CAP);
  // newest-first: the last created is at the front
  assert.equal(state.items[0].cluster, `c${EXPERIMENT_CAP + 4}`);
});

test("replaceExperiment / removeExperiment report found vs unknown id", () => {
  const { state: s1, created } = addExperiment(null, { cluster: "c", status: "running", variants: [] });
  const rep = replaceExperiment(s1, created.id, { cluster: "c2", status: "done", variants: [] });
  assert.equal(rep.found, true);
  assert.equal(rep.state.items[0].cluster, "c2");
  assert.equal(rep.state.items[0].status, "done");
  assert.equal(rep.state.items[0].id, created.id); // id preserved

  assert.equal(replaceExperiment(s1, "nope", { cluster: "x", status: "running", variants: [] }).found, false);
  assert.equal(removeExperiment(s1, created.id).found, true);
  assert.equal(removeExperiment(s1, "nope").found, false);
});

// --- store roundtrip (sqlite, both dispatchers share these transitions) -------

test("store: create → list → update → delete roundtrips through sqlite", async () => {
  const pid = "proj-store-1";
  await clearExperiments(pid);
  assert.deepEqual(await listExperiments(pid), []);

  const { created } = await createExperiment(pid, {
    cluster: "fakturace pro OSVČ",
    status: "running",
    variants: [
      { label: "A · Kontrola", visitors: 2100, signups: 63 },
      { label: "B · Cena nahoře", visitors: 2050, signups: 74 },
    ],
  });
  let items = await listExperiments(pid);
  assert.equal(items.length, 1);
  assert.equal(items[0].cluster, "fakturace pro OSVČ");

  const updated = await updateExperiment(pid, created.id, {
    cluster: "fakturace pro OSVČ",
    status: "done",
    variants: items[0].variants,
  });
  assert.equal(updated[0].status, "done");
  assert.equal(await updateExperiment(pid, "unknown", { cluster: "x", status: "done", variants: [] }), null);

  assert.equal(await deleteExperiment(pid, created.id), true);
  assert.equal(await deleteExperiment(pid, created.id), false);
  assert.deepEqual(await listExperiments(pid), []);
});

// --- resolve: live-over-sample ------------------------------------------------

test("resolveExperiments: sample when empty, live once persisted", async () => {
  const pid = "proj-resolve-1";
  await clearExperiments(pid);
  const sample = [{ id: "s1", cluster: "sample", status: "done", variants: [] }];

  const asSample = await resolveExperiments(pid, sample);
  assert.equal(asSample.source, "sample");
  assert.equal(asSample.experiments, sample);

  await createExperiment(pid, {
    cluster: "real",
    status: "done",
    variants: [
      { label: "A", visitors: 100, signups: 5 },
      { label: "B", visitors: 100, signups: 9 },
    ],
  });
  const asLive = await resolveExperiments(pid, sample);
  assert.equal(asLive.source, "live");
  assert.equal(asLive.experiments.length, 1);
  assert.equal(asLive.experiments[0].cluster, "real");
});

// --- the LIVE creative-pattern mining handoff (the integrity acceptance) ------

test("mining handoff: a real significant winner passes the live-tenant prompt gate; sample lessons still stripped", async () => {
  const pid = "proj-mine-1";
  await clearExperiments(pid);

  // No projectId / no persisted experiments → no experiment patterns (byte-identical).
  assert.deepEqual(await extractExperimentPatterns(undefined), []);
  assert.deepEqual(await extractExperimentPatterns(pid), []);

  // A `done` experiment whose challenger beats control by a wide margin at large n →
  // evaluate() reads it as statistically significant. Deliberately a cluster/angle that
  // does NOT appear in SAMPLE_EXPERIMENTS, so its title (→ sha1 id) can't collide with a
  // quarantined sample lesson — the realistic case of a genuinely new account experiment.
  await createExperiment(pid, {
    cluster: "e-mailový marketing nástroj",
    status: "done",
    variants: [
      { label: "A · Kontrola", visitors: 4200, signups: 176 },
      { label: "B · Zdarma navždy", visitors: 4180, signups: 231 },
    ],
  });

  const mined = await extractExperimentPatterns(pid);
  assert.equal(mined.length, 1, "one significant winner → one creative pattern");
  assert.equal(mined[0].category, "creative");
  // It is NOT a sample lesson (no honest suffix) → it legitimately survives the gate.
  assert.ok(!mined[0].insight.includes("ukázková lekce"));

  const all = [...mined, ...sampleLessonPatterns()];
  const safe = promptSafePatterns(all, true); // live tenant
  // The live experiment pattern survives…
  assert.ok(safe.some((p) => p.id === mined[0].id), "real experiment winner passes the live-tenant gate");
  // …while every demo-derived sample lesson is stripped.
  const sampleIds = new Set(sampleLessonPatterns().map((p) => p.id));
  assert.ok(safe.every((p) => !sampleIds.has(p.id)), "sample lessons still quarantined for a live tenant");

  await clearExperiments(pid);
});
