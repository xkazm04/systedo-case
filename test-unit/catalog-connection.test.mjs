/** Unit tests for persistent warehouse connections: token encryption at rest
 *  (round-trip, tamper detection, fail-safe when unconfigured), the sqlite connection
 *  store round-trip, and that publicConnection never leaks the token. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptToken, encryptToken, hasTokenCrypto } from "@/lib/inventory/token-crypto";
import { publicConnection } from "@/lib/inventory/connection-store";
import { deleteConnection, getConnection, saveConnection } from "@/lib/inventory/connection-store.local.ts";

test("token crypto: round-trips, and a tampered blob fails the auth tag", () => {
  process.env.CATALOG_TOKEN_SECRET = "unit-test-secret-please-ignore";
  assert.equal(hasTokenCrypto(), true);

  const secret = "bl-live-token-ABC123";
  const blob = encryptToken(secret);
  assert.notEqual(blob, secret);
  assert.match(blob, /^v1\./);
  assert.equal(decryptToken(blob), secret);

  const parts = blob.split(".");
  const wrongTag = Buffer.alloc(16, 7).toString("base64"); // 16-byte GCM tag, wrong
  assert.equal(decryptToken(`${parts[0]}.${parts[1]}.${wrongTag}.${parts[3]}`), null);
  assert.equal(decryptToken("not-a-valid-blob"), null);
});

test("token crypto: fail-safe when no secret is configured", () => {
  const saved = {
    a: process.env.CATALOG_TOKEN_SECRET,
    b: process.env.AUTH_SECRET,
    c: process.env.NEXTAUTH_SECRET,
  };
  delete process.env.CATALOG_TOKEN_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;
  try {
    assert.equal(hasTokenCrypto(), false);
    assert.throws(() => encryptToken("x"));
    assert.equal(decryptToken("v1.a.b.c"), null);
  } finally {
    if (saved.a !== undefined) process.env.CATALOG_TOKEN_SECRET = saved.a;
    if (saved.b !== undefined) process.env.AUTH_SECRET = saved.b;
    if (saved.c !== undefined) process.env.NEXTAUTH_SECRET = saved.c;
  }
});

test("publicConnection strips the token, keeps the metadata", () => {
  const pub = publicConnection({
    provider: "baselinker",
    inventoryId: "7",
    tokenEnc: "v1.secret.blob.here",
    connectedAt: "2026-07-05T00:00:00.000Z",
    lastSyncAt: "2026-07-05T01:00:00.000Z",
  });
  assert.equal(pub.provider, "baselinker");
  assert.equal(pub.inventoryId, "7");
  assert.equal(pub.hasToken, true);
  assert.equal(pub.lastSyncAt, "2026-07-05T01:00:00.000Z");
  assert.equal("tokenEnc" in pub, false); // the token never reaches the client
});

test("sqlite connection store round-trips + delete", async () => {
  const uid = "test-conn-user";
  const pid = "test-conn-proj";
  await saveConnection(uid, pid, {
    provider: "baselinker",
    inventoryId: "7",
    tokenEnc: "v1.aaa.bbb.ccc",
    connectedAt: "2026-07-05T00:00:00.000Z",
  });
  const c = await getConnection(uid, pid);
  assert.ok(c);
  assert.equal(c.provider, "baselinker");
  assert.equal(c.inventoryId, "7");
  assert.equal(c.tokenEnc, "v1.aaa.bbb.ccc");

  // re-save updates in place (lastSyncAt stamp)
  await saveConnection(uid, pid, { ...c, lastSyncAt: "2026-07-05T02:00:00.000Z" });
  assert.equal((await getConnection(uid, pid)).lastSyncAt, "2026-07-05T02:00:00.000Z");

  await deleteConnection(uid, pid);
  assert.equal(await getConnection(uid, pid), null);
});
