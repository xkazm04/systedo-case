/** WP W3-D — the twin INTAKE token store works fully offline: mint / show-once /
 *  re-mint / revoke / cascade against the LOCAL node:sqlite backend (table
 *  `twin_inbound_tokens`, migration v32), exercising the REAL store functions through
 *  the LOCAL_DB dispatcher.
 *
 *  It pins the properties the public route's whole security model rests on: the secret
 *  is ENCRYPTED at rest (a `grep` of the row never finds it), the address is a 128-bit
 *  hex token, a re-mint REPLACES rather than accumulating, and a revoked token resolves
 *  to null so the public URL 404s.
 *
 *  Temp-db pattern from outbound-stores-local.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-twin-inbound-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.WEBHOOK_SECRET_KEY = "test-twin-inbound-secret-key";

const {
  clearInboundTokens,
  getInboundToken,
  hasInboundCrypto,
  inboundPath,
  isInboundTokenShape,
  listInboundTokens,
  mintInboundToken,
  publicInboundToken,
  revokeInboundToken,
} = await import("@/lib/twin/inbound-store");
const { decryptSecret, looksEncrypted } = await import("@/lib/outbound/secret-crypto");
const { getDb } = await import("@/lib/db");

const U = "u-intake";
const P = "p-intake";

test("crypto is configured for this suite (else minting would be refused, not silent)", () => {
  assert.equal(hasInboundCrypto(), true);
});

test("mint returns a 128-bit hex address and the plaintext secret exactly once", async () => {
  const { row, secret } = await mintInboundToken(U, P, "social");
  assert.equal(isInboundTokenShape(row.token), true);
  assert.match(row.token, /^[0-9a-f]{32}$/);
  assert.equal(row.userId, U);
  assert.equal(row.projectId, P);
  assert.equal(row.channel, "social");
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(inboundPath(row.token), `/api/twin/inbound/${row.token}`);

  // The secret is stored ENCRYPTED and round-trips.
  assert.equal(looksEncrypted(row.secretEnc), true);
  assert.equal(row.secretEnc.includes(secret), false);
  assert.equal(decryptSecret(row.secretEnc), secret);
});

test("the plaintext secret is nowhere in the stored ROW (checked against the raw table)", async () => {
  const { row, secret } = await mintInboundToken(U, P, "email");
  const stored = getDb()
    .prepare("SELECT token, user_id, project_id, channel, secret_enc, created_at FROM twin_inbound_tokens WHERE token = ?")
    .get(row.token);
  assert.ok(stored, "the row exists");
  assert.equal(JSON.stringify(stored).includes(secret), false, "no column holds the plaintext");
});

test("the client-safe view turns the secret into a boolean and nothing else", async () => {
  const { row } = await mintInboundToken(U, P, "reviews");
  const pub = publicInboundToken(row);
  assert.deepEqual(Object.keys(pub).sort(), ["channel", "createdAt", "hasSecret", "token"]);
  assert.equal(pub.hasSecret, true);
  assert.equal(JSON.stringify(pub).includes(row.secretEnc), false);
});

test("the public route's ONLY input resolves the owner triple out of the stored row", async () => {
  const { row } = await mintInboundToken(U, P, "chat");
  const found = await getInboundToken(row.token);
  assert.equal(found.userId, U);
  assert.equal(found.projectId, P);
  assert.equal(found.channel, "chat");
});

test("a malformed token costs no read and resolves to null", async () => {
  assert.equal(await getInboundToken("nope"), null);
  assert.equal(await getInboundToken(""), null);
  assert.equal(await getInboundToken("../../etc/passwd"), null);
  assert.equal(await getInboundToken("A".repeat(32)), null, "uppercase is not the shape");
});

test("ONE endpoint per (project, channel): a re-mint REPLACES, and the old address dies", async () => {
  const first = await mintInboundToken(U, P, "sms");
  const second = await mintInboundToken(U, P, "sms");
  assert.notEqual(first.row.token, second.row.token);
  assert.notEqual(first.secret, second.secret);
  assert.equal(await getInboundToken(first.row.token), null, "the old address 404s at once");
  assert.ok(await getInboundToken(second.row.token));

  const rows = await listInboundTokens(U, P);
  assert.equal(rows.filter((r) => r.channel === "sms").length, 1);
});

test("the project's list is deterministic (token ascending — the Firestore twin's order)", async () => {
  const rows = await listInboundTokens(U, P);
  assert.deepEqual(
    rows.map((r) => r.token),
    [...rows.map((r) => r.token)].sort()
  );
  // Only this project's rows.
  assert.ok(rows.every((r) => r.userId === U && r.projectId === P));
});

test("another project cannot see or resolve this project's endpoints", async () => {
  const mine = await listInboundTokens(U, P);
  assert.ok(mine.length > 0);
  assert.deepEqual(await listInboundTokens(U, "p-other"), []);
  assert.deepEqual(await listInboundTokens("u-other", P), []);
});

test("revoke removes exactly one channel and answers honestly when there was nothing", async () => {
  assert.equal(await revokeInboundToken(U, P, "sms"), true);
  assert.equal(await revokeInboundToken(U, P, "sms"), false);
  const rows = await listInboundTokens(U, P);
  assert.equal(rows.some((r) => r.channel === "sms"), false);
  assert.ok(rows.some((r) => r.channel === "social"), "the other channels are untouched");
});

test("the delete cascade's hook drops every address the project owns", async () => {
  const before = await listInboundTokens(U, P);
  assert.ok(before.length > 0);
  await clearInboundTokens(U, P);
  assert.deepEqual(await listInboundTokens(U, P), []);
  for (const row of before) {
    assert.equal(await getInboundToken(row.token), null, "a cascaded project leaves no live intake URL");
  }
});
