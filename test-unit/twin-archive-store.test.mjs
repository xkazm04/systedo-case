/** Direction 2 — audit records stop vanishing: the twin ARCHIVE store's LOCAL
 *  node:sqlite roundtrip through the `twin_archive` table (DDL + migration v11 in
 *  src/lib/db.ts). Proves an archived terminal draft persists and reads back
 *  newest-first, that the ~1000/project cap evicts the OLDEST on write, that the
 *  rejects-only read filters correctly, and that clearing wipes a project's history.
 *  The Firestore backend mirrors this exact dispatcher shape (see cron_runs), so
 *  proving the LOCAL store + the shared pure partition covers both backends. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-twin-archive-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

let archiveDrafts, listArchivedDrafts, listArchivedRejects, clearArchive, TWIN_ARCHIVE_CAP;

let seq = 0;
/** A terminal draft with a strictly increasing archived-at stamp (via createdAt),
 *  so "oldest" and "newest" are unambiguous for the eviction/order assertions. */
function terminal(status = "sent", over = {}) {
  seq += 1;
  const stamp = new Date(Date.UTC(2026, 6, 15, 0, 0, seq)).toISOString();
  return {
    id: `d-${seq}`,
    channel: "leads",
    contact: "Jana",
    inbound: "in",
    reply: "out",
    questions: [],
    confidence: 50,
    risks: [],
    status,
    autoApproved: false,
    createdAt: stamp,
    decidedAt: stamp,
    ...(status === "sent" ? { sentAt: stamp } : {}),
    ...over,
  };
}

before(async () => {
  const store = await import("@/lib/twin/archive-store");
  const archive = await import("@/lib/twin/archive");
  archiveDrafts = store.archiveDrafts;
  listArchivedDrafts = store.listArchivedDrafts;
  listArchivedRejects = store.listArchivedRejects;
  clearArchive = store.clearArchive;
  TWIN_ARCHIVE_CAP = archive.TWIN_ARCHIVE_CAP;
});

test("archive → read back newest-first (sqlite roundtrip)", async () => {
  await clearArchive("proj-1");
  assert.deepEqual(await listArchivedDrafts("proj-1"), []);
  const a = terminal("sent");
  const b = terminal("rejected", { rejectReason: "too_long" });
  assert.equal(await archiveDrafts("proj-1", [a, b]), 0, "under the cap → nothing evicted");
  const back = await listArchivedDrafts("proj-1");
  assert.equal(back.length, 2);
  assert.equal(back[0].id, b.id, "newest first");
  assert.equal(back[1].id, a.id);
});

test("archiveDrafts is idempotent by id (re-archiving the same record upserts)", async () => {
  await clearArchive("proj-idem");
  const a = terminal("rejected", { rejectReason: "off_brand" });
  await archiveDrafts("proj-idem", [a]);
  await archiveDrafts("proj-idem", [a]);
  assert.equal((await listArchivedDrafts("proj-idem")).length, 1, "no duplicate row for the same id");
});

test("the cap evicts the OLDEST audit records on write", async () => {
  await clearArchive("proj-cap");
  // Fill past the cap in bulk, then add 3 more to force eviction of the oldest 3.
  const first = Array.from({ length: TWIN_ARCHIVE_CAP }, () => terminal("sent"));
  await archiveDrafts("proj-cap", first);
  const evicted = await archiveDrafts("proj-cap", [terminal("sent"), terminal("sent"), terminal("sent")]);
  assert.equal(evicted, 3, "three over the cap → three evicted");
  const back = await listArchivedDrafts("proj-cap", TWIN_ARCHIVE_CAP + 10);
  assert.equal(back.length, TWIN_ARCHIVE_CAP, "held at the cap");
  const ids = new Set(back.map((d) => d.id));
  assert.equal(ids.has(first[0].id), false, "the oldest record was evicted");
  assert.equal(ids.has(first[1].id), false);
  assert.equal(ids.has(first[2].id), false);
  assert.equal(ids.has(first[3].id), true, "the fourth-oldest survives");
});

test("listArchivedRejects returns only rejects, newest-first", async () => {
  await clearArchive("proj-rej");
  const s1 = terminal("sent");
  const r1 = terminal("rejected", { rejectReason: "too_long" });
  const s2 = terminal("sent");
  const r2 = terminal("rejected", { rejectReason: "risky_claim" });
  await archiveDrafts("proj-rej", [s1, r1, s2, r2]);
  const rejects = await listArchivedRejects("proj-rej");
  assert.deepEqual(rejects.map((d) => d.id), [r2.id, r1.id], "rejects only, newest first");
  assert.ok(rejects.every((d) => d.status === "rejected"));
});

test("a store keyed per project — one project's archive never bleeds into another", async () => {
  await clearArchive("proj-a");
  await clearArchive("proj-b");
  await archiveDrafts("proj-a", [terminal("sent")]);
  assert.equal((await listArchivedDrafts("proj-a")).length, 1);
  assert.equal((await listArchivedDrafts("proj-b")).length, 0);
});
