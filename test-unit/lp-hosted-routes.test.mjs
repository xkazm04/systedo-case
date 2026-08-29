/** WP W3-B — the three doors of a hosted LP experiment, end to end against a REAL
 *  sqlite file with only the session + project reads mocked (so the ownership guard is
 *  the real guard):
 *
 *   • `POST /api/microsite` with `kind: "lp"` — authed. The arms it publishes are the
 *     EXPERIMENT's arms under SERVER-minted identities, whatever the body claims.
 *   • `POST /m/{slug}/convert` — PUBLIC, unauthenticated, and the only write an
 *     anonymous visitor can reach here. Every claim it makes is pinned: it always
 *     answers 204, an unknown arm is silently not counted, a bot is not counted, and
 *     an over-long body is never parsed.
 *   • the `lp-sync` ledger step — the fold back into the experiment, pinned for
 *     idempotence (run twice → identical blob) and for the honesty rules it must not
 *     break.
 *
 *  The round trip in the middle is the acceptance: publish → three views and one
 *  conversion on arm B → sync → `evaluate()` sees arm B move, and only arm B. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-lp-hosted-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const OWNER = "u-owner";
const world = { uid: OWNER };
const project = (id) => ({
  id,
  name: "Taskio",
  type: "app",
  accentColor: "#0891b2",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

mock.module("@/lib/session", { namedExports: { currentUserId: async () => world.uid } });
mock.module("@/lib/projects/store", {
  namedExports: {
    getProject: async (uid, id) => (uid === OWNER && id === "p1" ? project(id) : null),
    listProjects: async () => [project("p1")],
  },
});

const { POST: micrositePost, DELETE: micrositeDelete } = await import("@/app/api/microsite/route");
const { POST: convertPost } = await import("@/app/m/[slug]/convert/route");
const { createExperiment, listExperiments } = await import("@/lib/lp-exp/store");
const { getMicrosite } = await import("@/lib/microsite");
const { bumpLpCount, listLpCountDays } = await import("@/lib/lp-exp/counts-store");
const { lpUtcDay } = await import("@/lib/lp-exp/counts");
const { pickArm } = await import("@/lib/lp-exp/serve");
const { runLpSync, lpSyncStep, LP_SYNC_STEP_ID } = await import("@/lib/lp-exp/sync-step");
const { evaluate } = await import("@/lib/lp-exp/compute");

const TODAY = lpUtcDay(new Date());
const NOW = new Date();

/** The beacon counts with `void` (the visitor must never wait on bookkeeping), so the
 *  assertions have to let the microtask + the sync sqlite write land. */
const settle = () => new Promise((r) => setTimeout(r, 30));

const arm = (n) => ({
  label: `V${n}`,
  headline: `Nadpis ${n}`,
  intro: `Úvod ${n}.`,
  bullets: [`Bod ${n}`],
  cta: "Chci to",
});

const publish = (lp) =>
  micrositePost(
    new Request("http://localhost/api/microsite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "p1", kind: "lp", lp }),
    })
  );

const convert = (slug, body, headers = {}) =>
  convertPost(
    new Request(`http://localhost/m/${slug}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) }
  );

/** The experiment under test — created with EMPTY arms, so "the numbers moved" can
 *  only mean the hosted traffic moved them. */
const { created } = await createExperiment("p1", {
  cluster: "projektove rizeni nastroj",
  status: "running",
  variants: [
    { label: "A · Kontrola", visitors: 0, signups: 0 },
    { label: "B · Šablony", visitors: 0, signups: 0 },
  ],
});

let slug = "";
let armIds = [];

/* ── the authed publish ─────────────────────────────────────────────────────── */

test("POST publishes the EXPERIMENT's arms under server-minted ids, not the body's", async () => {
  const res = await publish({
    experimentId: created.id,
    target: "https://taskio.cz/registrace",
    // A hostile body trying to pick its own counter keys and add an arm.
    arms: [
      { ...arm(1), armId: "hostile-a" },
      { ...arm(2), armId: "hostile-b" },
    ],
  });
  assert.equal(res.status, 200);
  const { microsite } = await res.json();
  slug = microsite.slug;
  assert.equal(microsite.kind, "lp");
  assert.equal(microsite.lp.experimentId, created.id);
  assert.equal(microsite.lp.projectId, "p1");
  assert.equal(microsite.lp.target, "https://taskio.cz/registrace");
  assert.equal(microsite.lp.arms.length, 2);
  for (const a of microsite.lp.arms) {
    assert.doesNotMatch(a.armId, /hostile/, "a body-supplied armId never becomes a counter key");
  }

  // The experiment itself is stamped — the binding and the identities the page serves.
  const stored = (await listExperiments("p1")).find((e) => e.id === created.id);
  armIds = stored.variants.map((v) => v.armId);
  assert.equal(stored.hosted.slug, slug);
  assert.deepEqual(armIds, microsite.lp.arms.map((a) => a.armId), "page arms == experiment arms");
});

test("a publish is refused when the arm count, the experiment or the project is wrong", async () => {
  assert.equal((await publish({ experimentId: created.id, arms: [arm(1)] })).status, 422, "1 arm ≠ 2 variants");
  assert.equal((await publish({ experimentId: "nope", arms: [arm(1), arm(2)] })).status, 422, "unknown experiment");
  assert.equal((await publish({ arms: [arm(1), arm(2)] })).status, 422, "no experiment named");
  assert.equal(
    (await publish({ experimentId: created.id, arms: [arm(1), { label: "hollow" }] })).status,
    422,
    "a hollow arm refuses the whole publish rather than shipping a blank public page"
  );
});

test("the published page carries no numbers and no invented CTA target", async () => {
  const bad = await publish({
    experimentId: created.id,
    target: "javascript:alert(1)",
    arms: [
      { ...arm(1), visitors: 9999, price: 500 },
      arm(2),
    ],
  });
  assert.equal(bad.status, 200);
  const { microsite } = await bad.json();
  assert.equal(microsite.lp.target, undefined, "a non-operator scheme is dropped, not rendered");
  assert.equal(microsite.lp.arms[0].visitors, undefined, "the payload is built, so no number rides in");
  assert.equal(microsite.lp.arms[0].price, undefined);
  // Re-publishing kept the identities the counters already use.
  assert.deepEqual(microsite.lp.arms.map((a) => a.armId), armIds);
});

/* ── serving + the public beacon ────────────────────────────────────────────── */

test("assignment draws only arms the payload actually carries", async () => {
  const config = await getMicrosite(slug);
  assert.equal(config.kind, "lp");
  const drawn = new Set();
  for (let i = 0; i < 200; i++) drawn.add(pickArm(config.lp.arms, Math.random).armId);
  assert.deepEqual([...drawn].sort(), [...armIds].sort(), "both arms served, and nothing else");
});

test("the beacon attributes to the SERVED arm, and always answers 204", async () => {
  const armB = armIds[1];
  // What the renderer does per request, for three requests that all drew arm B.
  for (let i = 0; i < 3; i++) await bumpLpCount(created.id, armB, TODAY, "views", "p1");

  const res = await convert(slug, { arm: armB }, { "user-agent": "Mozilla/5.0 Chrome/126.0" });
  assert.equal(res.status, 204);
  assert.match(res.headers.get("cache-control"), /no-store/);
  await settle();

  const rows = await listLpCountDays(created.id, TODAY);
  const rowB = rows.find((r) => r.armId === armB);
  assert.deepEqual(rowB, { experimentId: created.id, armId: armB, day: TODAY, views: 3, conversions: 1 });
  assert.equal(rows.find((r) => r.armId === armIds[0]), undefined, "arm A was never served, so it has no row");
});

test("an unknown arm, an unknown slug and a bot are all a silent 204 that counts nothing", async () => {
  const before = await listLpCountDays(created.id, TODAY);

  assert.equal((await convert(slug, { arm: "not-an-arm" })).status, 204, "a prober learns nothing");
  assert.equal((await convert("no-such-slug", { arm: armIds[1] })).status, 204);
  assert.equal(
    (await convert(slug, { arm: armIds[1] }, { "user-agent": "Slackbot-LinkExpanding 1.0" })).status,
    204,
    "the unfurler is answered, never counted"
  );
  assert.equal((await convert(slug, { arm: "" })).status, 204);
  assert.equal((await convert(slug, "not json")).status, 204);
  await settle();
  assert.deepEqual(await listLpCountDays(created.id, TODAY), before, "no counter moved");
});

test("an over-long body is never parsed into memory", async () => {
  const before = await listLpCountDays(created.id, TODAY);
  const huge = JSON.stringify({ arm: armIds[1], pad: "x".repeat(5000) });
  assert.equal((await convert(slug, huge)).status, 204);
  await settle();
  assert.deepEqual(await listLpCountDays(created.id, TODAY), before);
});

/* ── the sync step ──────────────────────────────────────────────────────────── */

test("the step's shape matches the ledger contract", () => {
  assert.equal(lpSyncStep.id, LP_SYNC_STEP_ID);
  assert.equal(lpSyncStep.id, "lp-sync");
  assert.equal(lpSyncStep.due(NOW, null), true, "due every tick — the counters move continuously");
  assert.ok(!lpSyncStep.id.includes("/"), "slash-free: it becomes a Firestore document id");
});

test("ACCEPTANCE: publish → 3 views + 1 conversion on arm B → sync → only arm B moved", async () => {
  const res = await runLpSync(NOW);
  assert.equal(res.ok, true);
  assert.equal(res.counts.projects, 1);
  assert.equal(res.counts.experiments, 1);
  assert.equal(res.counts.views, 3);
  assert.equal(res.counts.conversions, 1);
  assert.equal(res.counts.failed, 0);

  const stored = (await listExperiments("p1")).find((e) => e.id === created.id);
  const [a, b] = stored.variants;
  assert.deepEqual([a.visitors, a.signups], [0, 0], "arm A was never served and did not move");
  assert.deepEqual([b.visitors, b.signups], [3, 1], "arm B carries exactly what was counted");

  // And the verdict engine reads it — the whole point of the work package.
  const verdict = evaluate(stored);
  assert.equal(verdict.variants[1].cvr, 1 / 3);
  assert.equal(verdict.variants[0].cvr, 0);
});

test("the sync is IDEMPOTENT — running it twice produces an identical blob", async () => {
  const before = JSON.stringify(await listExperiments("p1"));
  const first = await runLpSync(NOW);
  const mid = JSON.stringify(await listExperiments("p1"));
  const second = await runLpSync(NOW);
  const after = JSON.stringify(await listExperiments("p1"));
  assert.equal(mid, before, "a re-run over unchanged counters writes nothing");
  assert.equal(after, mid);
  assert.deepEqual(first.counts.views, second.counts.views);
});

test("a hand-typed experiment is never visited by the sync step", async () => {
  const { created: manual } = await createExperiment("p1", {
    cluster: "rucne zadany",
    status: "done",
    variants: [
      { label: "A", visitors: 4200, signups: 176 },
      { label: "B", visitors: 4180, signups: 231 },
    ],
  });
  await runLpSync(NOW);
  const stored = (await listExperiments("p1")).find((e) => e.id === manual.id);
  assert.deepEqual(
    stored.variants.map((v) => [v.visitors, v.signups]),
    [[4200, 176], [4180, 231]],
    "no armId, no hosted binding — the operator's numbers are untouched"
  );
});

/* ── unpublish ──────────────────────────────────────────────────────────────── */

test("taking the page offline clears the binding but KEEPS the counters", async () => {
  const res = await micrositeDelete(
    new Request(`http://localhost/api/microsite?projectId=p1&slug=${slug}`, { method: "DELETE" })
  );
  assert.equal(res.status, 200);
  assert.equal(await getMicrosite(slug), null, "the public page is gone");

  const stored = (await listExperiments("p1")).find((e) => e.id === created.id);
  assert.equal(stored.hosted, undefined, "the experiment no longer claims a hosted split");
  assert.deepEqual(stored.variants.map((v) => v.armId), armIds, "the arm identities survive a re-publish");
  assert.deepEqual([stored.variants[1].visitors, stored.variants[1].signups], [3, 1], "…and so do the numbers");
  assert.equal((await listLpCountDays(created.id, TODAY)).length, 1, "the measured rows are real data, not page state");

  // The unpublished experiment stops being recomputed: its numbers freeze where the
  // page went dark rather than decaying.
  await runLpSync(NOW);
  const after = (await listExperiments("p1")).find((e) => e.id === created.id);
  assert.deepEqual([after.variants[1].visitors, after.variants[1].signups], [3, 1]);
});
