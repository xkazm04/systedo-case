/** The organic outcome ledger's LOCAL_DB half, end to end against a real
 *  node:sqlite file (WP W2-A): migration v27's two tables, the store trio's local
 *  backend, the `go-rollup` ledger step, and the delete path.
 *
 *  Why a real database rather than a fake: three of the four things this store owes
 *  are properties OF SQL, not of the TypeScript around it — the upsert-increment
 *  that makes two clicks in the same millisecond both count, the `IN (...)` read
 *  that must use placeholders rather than interpolation, and the retention DELETE.
 *  A hand-rolled double would assert the shape of the code instead of the behaviour
 *  of the store, which is the failure mode this repo's local-store tests exist to
 *  avoid (the campaigns-local-store shape).
 *
 *  `SYSTEDO_DB_FILE` + `LOCAL_DB` are set BEFORE the dynamic imports so the
 *  dispatcher resolves to the sqlite backend and the runner's per-process db file
 *  keeps parallel suites off each other's locks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-go-links-${process.pid}.db`);
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

const {
  saveGoLink,
  getGoLink,
  listGoLinks,
  listAllGoLinks,
  bumpGoClick,
  listGoClickDays,
  pruneGoClicks,
  clearGoLinks,
} = await import("@/lib/organic-channels/outcomes-store");
const { getOrganicOutcomes } = await import("@/lib/organic-channels/outcomes-state");
const { runGoRollup } = await import("@/lib/organic-channels/rollup-step");
const { rollupChannelOutcomes } = await import("@/lib/organic-channels/outcomes");

const NOW = new Date("2026-08-29T11:30:00.000Z");
const U = "u-owner";

const link = (id, projectId, channel, url) => ({
  id,
  userId: U,
  projectId,
  url: url ?? `https://example.cz/${id}`,
  channel,
  campaign: "kampan",
  createdAt: "2026-08-01T00:00:00.000Z",
});

test("migration v27 created both tables and the project index", async () => {
  const { getDb } = await import("@/lib/db");
  const names = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE name IN ('go_links','go_clicks','idx_go_links_project')")
    .all()
    .map((r) => r.name)
    .sort();
  assert.deepEqual(names, ["go_clicks", "go_links", "idx_go_links_project"]);
});

test("a saved link round-trips by id and by project, id-ordered", async () => {
  await saveGoLink(link("bbb00", "p1", "LinkedIn"));
  await saveGoLink(link("aaa00", "p1", "Newsletter"));
  await saveGoLink(link("zzz00", "p2", "Reddit"));

  const one = await getGoLink("bbb00");
  assert.equal(one.channel, "LinkedIn");
  assert.equal(one.userId, U);
  assert.equal(await getGoLink("nope"), null);

  assert.deepEqual(
    (await listGoLinks("p1")).map((l) => l.id),
    ["aaa00", "bbb00"],
    "ORDER BY id ASC — the twin of Firestore's __name__ ordering"
  );
  assert.deepEqual(
    (await listGoLinks("p2")).map((l) => l.id),
    ["zzz00"],
    "one project never sees another's links"
  );
});

test("saveGoLink is idempotent by id (re-mint replaces, never duplicates)", async () => {
  await saveGoLink(link("bbb00", "p1", "LinkedIn", "https://example.cz/changed"));
  const rows = await listGoLinks("p1");
  assert.equal(rows.length, 2, "still two links");
  assert.equal((await getGoLink("bbb00")).url, "https://example.cz/changed");
});

test("bumpGoClick increments in place; the read is windowed by day", async () => {
  await bumpGoClick("bbb00", "2026-08-29");
  await bumpGoClick("bbb00", "2026-08-29");
  await bumpGoClick("bbb00", "2026-08-22");
  await bumpGoClick("aaa00", "2026-08-28");
  // A counter for a project we are not asking about must not leak into the read.
  await bumpGoClick("zzz00", "2026-08-29");

  const rows = await listGoClickDays(["aaa00", "bbb00"], "2026-08-23");
  assert.deepEqual(rows, [
    { linkId: "aaa00", day: "2026-08-28", count: 1 },
    { linkId: "bbb00", day: "2026-08-29", count: 2 },
  ]);
  assert.deepEqual(await listGoClickDays([], "2026-08-01"), [], "an empty id list never queries");

  const all = await listGoClickDays(["aaa00", "bbb00"], "2026-01-01");
  assert.equal(all.length, 3, "the older row is still stored, just outside the 7d window");
});

test("the go-rollup step writes each project's blob and prunes past retention", async () => {
  // One row well past the 90-day cutoff (2026-05-31) — the prune must take it.
  await bumpGoClick("aaa00", "2026-01-05");
  assert.equal((await listGoClickDays(["aaa00"], "2026-01-01")).length, 2);

  const result = await runGoRollup(NOW);
  assert.equal(result.ok, true);
  assert.equal(result.counts.projects, 2, "p1 and p2 both rolled up");
  assert.equal(result.counts.links, 3);
  assert.equal(result.counts.pruned, 1, "the January row is past retention");

  const blob = await getOrganicOutcomes(U, "p1");
  assert.equal(blob.updatedAt, NOW.toISOString());
  const byChannel = Object.fromEntries(blob.channels.map((c) => [c.channel, c]));
  assert.deepEqual(
    { links: byChannel.LinkedIn.links, c7: byChannel.LinkedIn.clicks7d, c30: byChannel.LinkedIn.clicks30d },
    { links: 1, c7: 2, c30: 3 },
    "2 clicks today inside 7d; the 2026-08-22 one is 30d only"
  );
  assert.equal(byChannel.LinkedIn.lastClickAt, "2026-08-29");
  assert.equal(byChannel.Newsletter.clicks30d, 1);

  // The stored blob IS the pure rollup over the same rows — the cron adds no maths.
  const links = await listGoLinks("p1");
  const rows = await listGoClickDays(links.map((l) => l.id), "2026-07-31");
  assert.deepEqual(blob.channels, rollupChannelOutcomes(links, rows, NOW));
});

test("the rollup is idempotent — a second tick produces the same blob", async () => {
  const before = await getOrganicOutcomes(U, "p1");
  const again = await runGoRollup(NOW);
  assert.equal(again.ok, true);
  assert.deepEqual((await getOrganicOutcomes(U, "p1")).channels, before.channels);
  assert.equal(again.counts.pruned, 0, "nothing left older than the cutoff");
});

test("clearGoLinks drops the project's links AND their counters, leaving others alone", async () => {
  await clearGoLinks(U, "p1");
  assert.deepEqual(await listGoLinks("p1"), []);
  assert.deepEqual(await listGoClickDays(["aaa00", "bbb00"], "2026-01-01"), []);
  assert.equal((await listGoLinks("p2")).length, 1, "p2 is untouched");
  assert.equal((await listAllGoLinks(100)).length, 1);
});

test("the step is REGISTERED in LEDGER_STEPS — that is the whole ceremony", async () => {
  const { LEDGER_STEPS, planLedgerSteps } = await import("@/lib/cron/ledgers");
  const { GO_ROLLUP_STEP_ID, goRollupStep } = await import("@/lib/organic-channels/rollup-step");
  assert.equal(GO_ROLLUP_STEP_ID, "go-rollup");
  assert.ok(
    LEDGER_STEPS.some((s) => s.id === GO_ROLLUP_STEP_ID),
    "no new route, no vercel.json entry — appending here IS shipping the job"
  );
  // Due every tick: a rolling window has moved by definition, so there is no clock
  // to gate on. Asserted through the planner, which is what the route actually calls.
  assert.ok(
    planLedgerSteps(LEDGER_STEPS, NOW, {}).some((s) => s.id === GO_ROLLUP_STEP_ID),
    "due on a first run"
  );
  assert.ok(
    planLedgerSteps(LEDGER_STEPS, NOW, { [GO_ROLLUP_STEP_ID]: NOW.toISOString() }).some(
      (s) => s.id === GO_ROLLUP_STEP_ID
    ),
    "and due again on the very next tick"
  );
  assert.equal(goRollupStep.due(NOW, null), true);
});

test("the rollup only visits projects that still have links", async () => {
  const result = await runGoRollup(NOW);
  assert.equal(result.counts.projects, 1, "only p2, which still has a link");
  assert.equal(result.counts.links, 1);
  // p1's rolled-up blob is NOT rewritten to zeroes by this step — it has no links
  // left to visit. That is safe only because the one caller of clearGoLinks is the
  // project-delete cascade, which drops `project_state` (and therefore this blob)
  // in the same fan-out. Pinned so that a future "clear my links" affordance has to
  // confront the staleness rather than inherit it silently.
  assert.ok((await getOrganicOutcomes(U, "p1")).channels.length > 0);
});
