/** Authenticated encryption for webhook signing secrets at rest. Server-only.
 *
 *  A signing secret is the ONLY thing standing between a tenant's webhook receiver
 *  and a forged event, and it is long-lived (a receiver pins it in its own config),
 *  so it gets the same treatment warehouse tokens get: AES-256-GCM under a key
 *  derived (scrypt) from a server secret with a FRESH RANDOM SALT PER SECRET, and it
 *  is never returned to a client after the one PUT that mints it.
 *
 *  Blob format — `v1.<salt>.<iv>.<tag>.<ciphertext>` (base64 parts). There is no
 *  legacy format to read here (unlike inventory/token-crypto.ts, which still decrypts
 *  a static-salt v1): this seam ships with per-secret salts from its first commit, so
 *  `v1` IS the random-salt format. A tampered or wrong-key blob fails its GCM auth
 *  tag and returns null — never throws.
 *
 *  ROTATION HAZARD (same as the warehouse token seam): secrets are encrypted under
 *  whichever env var was FIRST in the chain below when they were written. Adding a
 *  dedicated WEBHOOK_SECRET_KEY to a deployment that stored secrets under AUTH_SECRET
 *  — or rotating AUTH_SECRET — makes every stored blob undecryptable, and every
 *  delivery then fails with a signing error until the owner re-mints each endpoint's
 *  secret. `looksEncrypted` lets a caller tell that state ("a blob is stored but
 *  cannot be opened") from "no secret at all". Treat a secret-chain change as a mass
 *  re-mint. */
import "server-only";
import crypto from "node:crypto";

/** scrypt salt length (bytes), fresh per secret. */
const SALT_BYTES = 16;

/** Domain-separation context mixed into the salt so a blob encrypted for a webhook
 *  secret can never be opened by (or confused with) another seam's key derivation,
 *  even when both derive from the same AUTH_SECRET. */
const SALT_CONTEXT = "systedo-webhook-secret-v1";

/** How many bytes of entropy a minted signing secret carries. 32 bytes → a 64-char
 *  hex string, comfortably beyond brute force against HMAC-SHA256. */
const SECRET_BYTES = 32;

/** Server secret the key is derived from, in precedence order: the dedicated
 *  WEBHOOK_SECRET_KEY, else the app's AUTH_SECRET / NEXTAUTH_SECRET. */
function secret(): string | null {
  return (
    process.env.WEBHOOK_SECRET_KEY ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    null
  );
}

/** Whether webhook-secret encryption is configured. The PUT route answers 501
 *  `server-misconfigured` when this is false, rather than storing a plaintext
 *  secret — fail-safe, the warehouse route's posture. */
export function hasWebhookCrypto(): boolean {
  return secret() !== null;
}

/** Derive a 32-byte AES-256 key from the server secret + this blob's salt. The
 *  domain context is prepended to the random salt so the derivation is scoped to
 *  this seam. */
function deriveKey(s: string, salt: Buffer): Buffer {
  return crypto.scryptSync(s, Buffer.concat([Buffer.from(SALT_CONTEXT, "utf8"), salt]), 32);
}

/** True when `blob` has the shape of a stored encrypted secret. Purely syntactic —
 *  it does not attempt to decrypt — so a caller can distinguish "stored but
 *  unopenable (rotated key)" from "never set". */
export function looksEncrypted(blob: string | null | undefined): boolean {
  if (!blob) return false;
  const parts = blob.split(".");
  return parts[0] === "v1" && parts.length === 5;
}

/** A fresh signing secret, shown to the owner ONCE and stored only encrypted. */
export function mintWebhookSecret(): string {
  return crypto.randomBytes(SECRET_BYTES).toString("hex");
}

/** Encrypt a signing secret → `v1.<salt>.<iv>.<tag>.<ciphertext>`. Throws when no
 *  server secret is configured (callers gate on {@link hasWebhookCrypto} first). */
export function encryptSecret(plain: string): string {
  const s = secret();
  if (!s) throw new Error("Šifrování webhook tajemství není nakonfigurováno (WEBHOOK_SECRET_KEY).");
  const salt = crypto.randomBytes(SALT_BYTES);
  const k = deriveKey(s, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${salt.toString("base64")}.${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

/** Decrypt a blob produced by {@link encryptSecret}. Returns null on a missing key,
 *  a bad format, or a failed auth tag (tamper / rotated key) — never throws. */
export function decryptSecret(blob: string): string | null {
  const s = secret();
  if (!s) return null;
  const parts = blob.split(".");
  if (parts[0] !== "v1" || parts.length !== 5) return null;
  try {
    const k = deriveKey(s, Buffer.from(parts[1], "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(parts[2], "base64"));
    decipher.setAuthTag(Buffer.from(parts[3], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
