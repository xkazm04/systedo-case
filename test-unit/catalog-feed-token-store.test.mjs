/** WP W2-D — the outbound-feed TOKEN store's LOCAL_DB backend, driven through the real
 *  dispatcher (`@/lib/catalog/feed-token-store`), so this proves the sqlite twin AND the
 *  dispatcher wiring in one pass: a mint is addressable by token, re-minting REPLACES
 *  (the old address stops resolving in the same step), revoke is honest about whether
 *  there was anything to revoke, tokens are per-project, and clear scrubs the project
 *  (the delete-cascade seam).
 *
 *  Harness: a temp db keyed by pid + SYSTEDO_DB_FILE + LOCAL_DB set BEFORE the dynamic
 *  import (the campaigns-local-store shape) — never the shared `.data/systedo.db`. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-feed-tokens-${process.pid}.db`);
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
  getFeedToken,
  getProjectFeedToken,
  mintFeedToken,
  revokeFeedToken,
  clearFeedTokens,
  isFeedTokenShape,
} = await import("@/lib/catalog/feed-token-store.ts");

const UID = "u_test";
const PID = "proj_feed";
const OTHER = "proj_other";

test("mintFeedToken: 32 hex chars, addressable by token, owner rides in the row", async () => {
  const row = await mintFeedToken(UID, PID, new Date("2026-08-29T10:00:00Z"));
  assert.match(row.token, /^[0-9a-f]{32}$/);
  assert.equal(row.userId, UID);
  assert.equal(row.projectId, PID);
  assert.equal(row.createdAt, "2026-08-29T10:00:00.000Z");

  const read = await getFeedToken(row.token);
  assert.deepEqual(read, row, "the public route's only input reads back byte-for-byte");

  const byProject = await getProjectFeedToken(UID, PID);
  assert.equal(byProject.token, row.token, "the panel's by-project lookup finds the same row");
});

test("re-minting REPLACES: the previous address stops resolving in the same step", async () => {
  const first = await getProjectFeedToken(UID, PID);
  const second = await mintFeedToken(UID, PID);

  assert.notEqual(second.token, first.token);
  assert.equal(await getFeedToken(first.token), null, "the old capability URL is dead");
  assert.equal((await getProjectFeedToken(UID, PID)).token, second.token);
});

test("tokens are per-project — one project's mint never answers for another", async () => {
  const mine = await getProjectFeedToken(UID, PID);
  assert.equal(await getProjectFeedToken(UID, OTHER), null);

  const other = await mintFeedToken(UID, OTHER);
  assert.notEqual(other.token, mine.token);
  assert.equal((await getFeedToken(mine.token)).projectId, PID);
  assert.equal((await getFeedToken(other.token)).projectId, OTHER);
});

test("getFeedToken rejects a malformed token WITHOUT touching the store", async () => {
  // The hex string is a deliberately WRONG-CASE token shape, not a credential.
  for (const junk of ["", "nope", "../../etc/passwd", "ABCDEF0123456789abcdef0123456789", "%"]) { // gitleaks:allow
    assert.equal(await getFeedToken(junk), null, `${junk} is not a token shape`);
  }
  assert.equal(isFeedTokenShape("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isFeedTokenShape("0123456789ABCDEF0123456789abcdef"), false, "lowercase hex only");
});

test("revokeFeedToken is honest about whether there was anything to revoke", async () => {
  const row = await getProjectFeedToken(UID, PID);
  assert.equal(await revokeFeedToken(UID, PID), true);
  assert.equal(await getFeedToken(row.token), null);
  assert.equal(await getProjectFeedToken(UID, PID), null);
  assert.equal(await revokeFeedToken(UID, PID), false, "a second revoke claims nothing it did not do");
});

test("clearFeedTokens scrubs the project — the delete-cascade seam", async () => {
  const row = await mintFeedToken(UID, PID);
  await clearFeedTokens(UID, PID);
  assert.equal(await getFeedToken(row.token), null);
  assert.equal(await getProjectFeedToken(UID, PID), null);
  // The sibling project is untouched: the cascade is scoped, not a table wipe.
  assert.notEqual(await getProjectFeedToken(UID, OTHER), null);
});
