/** Feedback store, LOCAL sqlite backend (src/lib/feedback/store.local.ts via the
 *  LOCAL_DB dispatcher): append + newest-first listing against the real
 *  node:sqlite table (DDL/migration v18 in src/lib/db.ts). Mirrors the
 *  onboarding-progress test's hermetic per-file db setup. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-feedback-store-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { addFeedback, listFeedback } = await import("@/lib/feedback/store");

const entry = (id, at, over = {}) => ({
  id,
  message: `zpráva ${id}`,
  source: "app",
  at,
  ...over,
});

test("add + list roundtrip, newest first, optional fields intact", async () => {
  await addFeedback(entry("f1", "2026-08-01T10:00:00.000Z"));
  await addFeedback(
    entry("f2", "2026-08-02T10:00:00.000Z", {
      email: "visitor@example.com",
      userId: "u1",
      path: "/dashboard",
      source: "demo",
    })
  );
  const rows = await listFeedback();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "f2", "newest first");
  assert.equal(rows[0].email, "visitor@example.com");
  assert.equal(rows[0].userId, "u1");
  assert.equal(rows[0].path, "/dashboard");
  assert.equal(rows[0].source, "demo");
  assert.equal(rows[1].email, undefined);
});

test("list honors the limit", async () => {
  const rows = await listFeedback(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "f2");
});
