/** Direction 3 — token crypto v2 (per-token salts). Verifies: v2 round-trip and blob
 *  shape (a fresh salt per encryption), backward-compatible decryption of legacy v1
 *  blobs, and that tamper / wrong-secret return null rather than throwing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decryptToken, encryptToken } from "@/lib/inventory/token-crypto";

const SECRET = "unit-test-secret-v2-please-ignore";

/** Reconstruct a legacy v1 blob the old code would have written, so we can prove the
 *  v2 decrypt path still reads it: one key from the STATIC salt, `v1.<iv>.<tag>.<ct>`. */
function makeV1Blob(secret, plain) {
  const key = crypto.scryptSync(secret, "systedo-catalog-token-v1", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

test("v2: round-trips and writes a v2.<salt>.<iv>.<tag>.<ct> blob", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const token = "bl-live-token-XYZ789";
  const blob = encryptToken(token);
  const parts = blob.split(".");
  assert.equal(parts[0], "v2");
  assert.equal(parts.length, 5, "v2 carries salt + iv + tag + ct");
  assert.equal(decryptToken(blob), token);
});

test("v2: a fresh random salt per encryption (same plaintext → different blobs)", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const a = encryptToken("same-token");
  const b = encryptToken("same-token");
  assert.notEqual(a, b);
  assert.notEqual(a.split(".")[1], b.split(".")[1], "salts differ");
  assert.equal(decryptToken(a), "same-token");
  assert.equal(decryptToken(b), "same-token");
});

test("v1 compat: a legacy v1 blob still decrypts under the same secret", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const legacy = makeV1Blob(SECRET, "legacy-token-123");
  assert.match(legacy, /^v1\./);
  assert.equal(decryptToken(legacy), "legacy-token-123");
});

test("tamper: a corrupted v2 tag returns null (never throws)", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const parts = encryptToken("tok").split(".");
  const wrongTag = Buffer.alloc(16, 9).toString("base64");
  assert.equal(decryptToken(`v2.${parts[1]}.${parts[2]}.${wrongTag}.${parts[4]}`), null);
  // a v2 blob with a tampered salt derives the wrong key → auth fails → null
  const wrongSalt = crypto.randomBytes(16).toString("base64");
  assert.equal(decryptToken(`v2.${wrongSalt}.${parts[2]}.${parts[3]}.${parts[4]}`), null);
  assert.equal(decryptToken("v2.only.three.parts"), null);
});

test("wrong secret: a v2 blob does not decrypt under a different secret", () => {
  process.env.CATALOG_TOKEN_SECRET = SECRET;
  const blob = encryptToken("secret-token");
  process.env.CATALOG_TOKEN_SECRET = "a-totally-different-secret";
  assert.equal(decryptToken(blob), null);
  process.env.CATALOG_TOKEN_SECRET = SECRET; // restore for other tests
});
