/** Authenticated encryption for BYOM provider API keys at rest. Server-only.
 *
 *  A user's OpenAI/Anthropic/Gemini API key is a long-lived secret we must be able
 *  to decrypt at call time (unlike the OAuth tokens Auth.js keeps), so we encrypt it
 *  (AES-256-GCM) before storing and never return the plaintext to the client. The
 *  key is derived (scrypt) from a dedicated server secret with a BYOM-specific salt
 *  context — so a leaked catalog secret can't decrypt BYOM keys and vice versa. If
 *  no secret is configured, encryption is unavailable and the connect flow refuses
 *  to store a key (fail-safe — never a plaintext key at rest). Mirrors
 *  inventory/token-crypto.ts by design. */
import "server-only";
import crypto from "node:crypto";

/** Server secret the key is derived from (dedicated, else the app's auth secret). */
function secret(): string | null {
  return (
    process.env.BYOM_KEY_SECRET ||
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
  cachedKey = crypto.scryptSync(s, "systedo-byom-key-v1", 32);
  cachedFrom = s;
  return cachedKey;
}

/** Whether BYOM key encryption is configured (a secret is available). */
export function hasByomCrypto(): boolean {
  return secret() !== null;
}

/** Encrypt a key → `v1.<iv>.<tag>.<ciphertext>` (base64 parts). Throws if no key. */
export function encryptByomKey(plain: string): string {
  const k = key();
  if (!k) throw new Error("Šifrování BYOM klíče není nakonfigurováno (chybí BYOM_KEY_SECRET).");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a blob produced by encryptByomKey. Returns null on a missing key, bad
 *  format, or a failed auth tag (tamper) — never throws. */
export function decryptByomKey(blob: string): string | null {
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
