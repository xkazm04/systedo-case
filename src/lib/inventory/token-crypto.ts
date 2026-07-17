/** Authenticated encryption for warehouse API tokens at rest. Server-only.
 *
 *  Warehouse/ERP tokens are long-lived, non-expiring secrets, so — unlike the OAuth
 *  access tokens Auth.js keeps in Firestore — we encrypt them (AES-256-GCM) before
 *  storing, and never return the plaintext to the client. The key is derived (scrypt)
 *  from a server secret; if none is configured, encryption is unavailable and the
 *  connect flow refuses to store a token (fail-safe — never a plaintext token at rest).
 *  The credential-free demo provider needs no token, so it works without a key.
 *
 *  Blob formats (dot-joined, base64 parts):
 *    v1.<iv>.<tag>.<ct>          — LEGACY. One key for every token, derived from a
 *                                  STATIC scrypt salt. Read-only: still decrypts so
 *                                  connections stored before v2 keep working.
 *    v2.<salt>.<iv>.<tag>.<ct>   — CURRENT (written by encryptToken). A fresh random
 *                                  16-byte salt PER TOKEN is stored in the blob and the
 *                                  key is derived scrypt(secret, salt). Distinct salts
 *                                  mean two tenants encrypting the same token get
 *                                  distinct keys + ciphertext, and re-encrypting rotates
 *                                  the salt — no single cached key shared across tenants.
 *  Both formats verify the GCM auth tag; a tampered or wrong-secret blob returns null
 *  (never throws). */
import "server-only";
import crypto from "node:crypto";

/** The static scrypt salt v1 blobs were derived with (legacy — decrypt path only). */
const V1_SALT = "systedo-catalog-token-v1";
/** Per-token random salt length for v2 (bytes). */
const V2_SALT_BYTES = 16;

/** Server secret the key is derived from, in precedence order: the dedicated
 *  CATALOG_TOKEN_SECRET, else the app's AUTH_SECRET / NEXTAUTH_SECRET.
 *
 *  ROTATION HAZARD: tokens are encrypted under whichever secret was FIRST in this chain
 *  when they were written. If a deployment stored tokens under AUTH_SECRET and an
 *  operator later adds a dedicated CATALOG_TOKEN_SECRET (or rotates AUTH_SECRET), the
 *  active secret no longer matches — every stored blob then fails its GCM tag and
 *  decrypts to null, so all warehouse connections silently stop syncing until each user
 *  re-enters their token. Callers should use `looksEncrypted` to tell "a blob is stored
 *  but undecryptable" (env changed under it) from "no token at all", and message the two
 *  differently. Changing the secret set = a mass token re-entry; treat it as such. */
function secret(): string | null {
  return (
    process.env.CATALOG_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  );
}

/** Derive a 32-byte AES-256 key from the secret + a salt (scrypt). */
function deriveKey(s: string, salt: crypto.BinaryLike): Buffer {
  return crypto.scryptSync(s, salt, 32);
}

// The v1 salt is fixed, so its key can be cached across calls (v2 salts are per-token
// and derived fresh each time — nothing shared to cache).
let cachedV1Key: Buffer | null = null;
let cachedV1From: string | null = null;
function v1Key(s: string): Buffer {
  if (cachedV1Key && cachedV1From === s) return cachedV1Key;
  cachedV1Key = deriveKey(s, V1_SALT);
  cachedV1From = s;
  return cachedV1Key;
}

/** Whether token encryption is configured (a secret is available). */
export function hasTokenCrypto(): boolean {
  return secret() !== null;
}

/** True when `blob` has the shape of a stored encrypted token (v1/v2 envelope). Lets a
 *  caller distinguish "a token IS stored but decryptToken returned null" (wrong/rotated
 *  secret, or a tampered blob) from "no token was ever entered" — the two need different
 *  user messaging. Pure syntactic check; does not attempt to decrypt. */
export function looksEncrypted(blob: string | null | undefined): boolean {
  if (!blob) return false;
  const parts = blob.split(".");
  return (parts[0] === "v1" && parts.length === 4) || (parts[0] === "v2" && parts.length === 5);
}

/** Encrypt a token → `v2.<salt>.<iv>.<tag>.<ciphertext>` (base64 parts), deriving a key
 *  from a fresh per-token salt. Throws if no secret is configured. */
export function encryptToken(plain: string): string {
  const s = secret();
  if (!s) throw new Error("Šifrování tokenu není nakonfigurováno (chybí CATALOG_TOKEN_SECRET).");
  const salt = crypto.randomBytes(V2_SALT_BYTES);
  const k = deriveKey(s, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${salt.toString("base64")}.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a blob produced by encryptToken (either the current v2 format or a legacy
 *  v1 blob). Returns null on a missing secret, bad format, or a failed auth tag
 *  (tamper / wrong secret) — never throws. */
export function decryptToken(blob: string): string | null {
  const s = secret();
  if (!s) return null;
  const parts = blob.split(".");
  try {
    if (parts[0] === "v1" && parts.length === 4) {
      return gcmOpen(v1Key(s), parts[1], parts[2], parts[3]);
    }
    if (parts[0] === "v2" && parts.length === 5) {
      const k = deriveKey(s, Buffer.from(parts[1], "base64"));
      return gcmOpen(k, parts[2], parts[3], parts[4]);
    }
    return null;
  } catch {
    return null;
  }
}

/** AES-256-GCM open over base64 iv/tag/ciphertext. Throws on a bad tag (caller maps
 *  the throw to null). */
function gcmOpen(k: Buffer, ivB64: string, tagB64: string, ctB64: string): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
