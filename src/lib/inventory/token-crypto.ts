/** Authenticated encryption for warehouse API tokens at rest. Server-only.
 *
 *  Warehouse/ERP tokens are long-lived, non-expiring secrets, so — unlike the OAuth
 *  access tokens Auth.js keeps in Firestore — we encrypt them (AES-256-GCM) before
 *  storing, and never return the plaintext to the client. The key is derived (scrypt)
 *  from a server secret; if none is configured, encryption is unavailable and the
 *  connect flow refuses to store a token (fail-safe — never a plaintext token at rest).
 *  The credential-free demo provider needs no token, so it works without a key. */
import "server-only";
import crypto from "node:crypto";

/** Server secret the key is derived from (dedicated, else the app's auth secret). */
function secret(): string | null {
  return (
    process.env.CATALOG_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  );
}

let cachedKey: Buffer | null = null;
let cachedFrom: string | null = null;
function key(): Buffer | null {
  const s = secret();
  if (!s) return null;
  if (cachedKey && cachedFrom === s) return cachedKey;
  cachedKey = crypto.scryptSync(s, "systedo-catalog-token-v1", 32);
  cachedFrom = s;
  return cachedKey;
}

/** Whether token encryption is configured (a secret is available). */
export function hasTokenCrypto(): boolean {
  return secret() !== null;
}

/** Encrypt a token → `v1.<iv>.<tag>.<ciphertext>` (base64 parts). Throws if no key. */
export function encryptToken(plain: string): string {
  const k = key();
  if (!k) throw new Error("Šifrování tokenu není nakonfigurováno (chybí CATALOG_TOKEN_SECRET).");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a blob produced by encryptToken. Returns null on a missing key, bad
 *  format, or a failed auth tag (tamper) — never throws. */
export function decryptToken(blob: string): string | null {
  const k = key();
  if (!k) return null;
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ct = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
