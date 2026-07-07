/** Per-(user, project, key) state store (src/lib/project-state/store.local.ts):
 *  a JSON-blob roundtrip against a throwaway sqlite file — save → read back,
 *  overwrite replaces, and (project, key) tuples stay isolated. Exercises the new
 *  `project_state` table (DDL in src/lib/db.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Point the local db at a throwaway file BEFORE the store lazily opens it.
const dbFile = join(tmpdir(), "systedo-project-state-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true"; // route the dispatcher to the node:sqlite backend

const { getProjectState, saveProjectState } = await import("@/lib/project-state/store");

const U = "user-1";
const P = "proj-1";

test("unsaved (user, project, key) reads back null (→ caller seeds)", async () => {
  assert.equal(await getProjectState(U, P, "content-schedule"), null);
});

test("save then get roundtrips the exact blob", async () => {
  const board = [{ id: "post-0", status: "scheduled", day: 3 }];
  await saveProjectState(U, P, "content-schedule", board);
  assert.deepEqual(await getProjectState(U, P, "content-schedule"), board);
});

test("saving again replaces the whole blob", async () => {
  await saveProjectState(U, P, "content-schedule", [{ id: "post-0", status: "published", day: 3 }]);
  const got = await getProjectState(U, P, "content-schedule");
  assert.equal(got.length, 1);
  assert.equal(got[0].status, "published");
});

test("distinct keys and projects are isolated", async () => {
  await saveProjectState(U, P, "reviews", { answered: ["r1"], flagged: [], drafts: {} });
  await saveProjectState(U, "proj-2", "content-schedule", [{ id: "x" }]);
  // the reviews key is untouched by the content-schedule writes above
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["r1"], flagged: [], drafts: {} });
  // proj-1 and proj-2 don't bleed into each other
  assert.deepEqual(await getProjectState(U, "proj-2", "content-schedule"), [{ id: "x" }]);
  // content-schedule on proj-1 is still the published board from the previous test
  assert.equal((await getProjectState(U, P, "content-schedule"))[0].status, "published");
});
