/** Shared Bearer-token guard for the Vercel Cron endpoints. Vercel sends
 *  `Authorization: Bearer <CRON_SECRET>` when the env var is set.
 *
 *  Fails CLOSED: with no CRON_SECRET configured, nobody is authorized (the crons
 *  stay disabled) rather than open. Compares in constant time — both sides are
 *  SHA-256'd to a fixed 32-byte digest so `timingSafeEqual` always gets
 *  equal-length inputs and neither the secret's value nor its length leaks via a
 *  timing side-channel. Server-only (node:crypto). */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled until a secret is configured
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
