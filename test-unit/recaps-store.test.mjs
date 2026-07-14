/** Direction 1 — recaps become records: the store dispatcher's LOCAL node:sqlite
 *  roundtrip through the `recaps` table (DDL in src/lib/db.ts). Proves a recorded
 *  recap persists and reads back, that the per-period cap is enforced by the shared
 *  read-modify-write (recordRecap → appendRecap), and that latest/list are
 *  newest-first. The Firestore backend mirrors this exact dispatcher shape (see
 *  diagnoses/annotations), so proving the LOCAL twin + the shared pure transitions
 *  covers both backends. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-recaps-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

let recordRecap, getRecaps, latestRecap, listRecaps, clearRecaps, buildStoredRecap, RECAP_HISTORY_CAP;

let seq = 0;
const idOf = () => `id-${++seq}`;
function recap(period = "30d", over = {}) {
  return buildStoredRecap(
    {
      period,
      result: { headline: `h-${period}-${seq}`, summary: "s", highlights: ["a"], watchouts: ["b"], priorities: [{ title: "t", detail: "d" }] },
      inputHash: "hash",
      locale: "cs",
      ...over,
    },
    idOf
  );
}

before(async () => {
  const store = await import("@/lib/recaps/store");
  const types = await import("@/lib/recaps/types");
  recordRecap = store.recordRecap;
  getRecaps = store.getRecaps;
  latestRecap = store.latestRecap;
  listRecaps = store.listRecaps;
  clearRecaps = store.clearRecaps;
  buildStoredRecap = types.buildStoredRecap;
  RECAP_HISTORY_CAP = types.RECAP_HISTORY_CAP;
});

test("record → read back the same recap (sqlite roundtrip)", async () => {
  await clearRecaps("proj-1");
  assert.equal(await getRecaps("proj-1"), null);
  const r = recap("30d", { inputHash: "H1" });
  await recordRecap("proj-1", r);
  const state = await getRecaps("proj-1");
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].id, r.id);
  assert.equal(state.items[0].inputHash, "H1");
  const latest = await latestRecap("proj-1", "30d");
  assert.equal(latest.id, r.id);
});

test("recordRecap enforces the per-period cap and stays newest-first", async () => {
  await clearRecaps("proj-2");
  let last;
  for (let i = 0; i < RECAP_HISTORY_CAP + 3; i++) {
    last = recap("30d");
    await recordRecap("proj-2", last);
  }
  await recordRecap("proj-2", recap("90d"));
  const thirty = await listRecaps("proj-2", "30d");
  assert.equal(thirty.length, RECAP_HISTORY_CAP);
  assert.equal(thirty[0].id, last.id); // newest-first
  assert.equal((await listRecaps("proj-2", "90d")).length, 1);
  // periods are isolated by key: project+period
  assert.equal((await latestRecap("proj-2", "90d")).period, "90d");
});

test("a store keyed per project — one project's recaps never bleed into another", async () => {
  await clearRecaps("proj-a");
  await clearRecaps("proj-b");
  await recordRecap("proj-a", recap("30d"));
  assert.equal((await listRecaps("proj-a", "30d")).length, 1);
  assert.equal((await listRecaps("proj-b", "30d")).length, 0);
});
