/** Direction: the public surface gets rails — (a) LOCAL_DB parity for the
 *  per-user social connections. `socialConnections` was Firestore-ONLY, so under
 *  `npm run dev:local` the accounts API and the publish cron's
 *  listConnectedSocialUserIds hit firebase-admin and failed. The store now
 *  dispatches (the sklik-connection posture): this suite drives the REAL
 *  connection functions end-to-end against the sqlite twin (rows in tenant_docs
 *  under the reserved `__social__` pseudo-tenant) — connect → list → cron
 *  eligibility → disconnect — plus the token-stripping contract. The Firestore
 *  backend keeps the exact pre-seam queries (asserted by review; it cannot run
 *  offline — the same posture as sklik-connection/tenant-docs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-social-conn-${process.pid}.db`);
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
  connectAccount,
  disconnectAccount,
  getAccount,
  getAccountToken,
  listAccounts,
  listConnectedSocialUserIds,
} = await import("@/lib/social/connection");

test("offline dev works: connect account → listed → cron-eligible → disconnect", async () => {
  const uid = "local-user-1";
  assert.deepEqual(await listAccounts(uid), [], "no accounts before connect");
  assert.deepEqual(await listConnectedSocialUserIds(), [], "nobody cron-eligible yet");

  await connectAccount(uid, "facebook");
  const accounts = await listAccounts(uid);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].platform, "facebook");
  assert.equal(accounts[0].demo, true, "no credentials → an honest demo connection");
  assert.ok(!("tokenEnc" in accounts[0]), "the public projection never carries token bytes");

  const one = await getAccount(uid, "facebook");
  assert.equal(one?.platform, "facebook");
  assert.equal(await getAccountToken(uid, "facebook"), null, "a demo connection has no token");

  assert.deepEqual(
    await listConnectedSocialUserIds(),
    [uid],
    "a connected user is visible to the publish cron's fan-out"
  );

  await disconnectAccount(uid, "facebook");
  assert.deepEqual(await listAccounts(uid), []);
  assert.deepEqual(
    await listConnectedSocialUserIds(),
    [],
    "a user with zero accounts drops out of the cron set"
  );
});

test("connect is idempotent per platform and users are isolated", async () => {
  await connectAccount("local-user-2", "instagram");
  await connectAccount("local-user-2", "instagram");
  await connectAccount("local-user-2", "linkedin");
  const accounts = await listAccounts("local-user-2");
  assert.deepEqual(accounts.map((a) => a.platform).sort(), ["instagram", "linkedin"]);

  assert.deepEqual(await listAccounts("local-user-3"), [], "another user sees nothing");
  assert.deepEqual((await listConnectedSocialUserIds()).sort(), ["local-user-2"]);
});
