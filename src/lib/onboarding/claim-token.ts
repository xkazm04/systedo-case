/** The public-scan CLAIM token — the one piece of state that has to survive the
 *  sign-in redirect on the anonymous `/sken` path.
 *
 *  An anonymous visitor scans their own site, likes the read, and clicks "save as
 *  a project". At that moment there is no account to attach the result to, and the
 *  OAuth round-trip destroys any client state we would otherwise trust. So the
 *  scan's SANITIZED profile is parked server-side under a 128-bit random token,
 *  the token rides the `callbackUrl`, and the redeem route (which DOES have a
 *  session) turns it into a real project.
 *
 *  What this deliberately is NOT:
 *   - not a session, not an identity, not a credential for anything but its own
 *     blob: it grants the bearer the right to seed a project THEY own with a
 *     profile THEY produced;
 *   - not a place for tenant data — the blob holds the sanitized profile and the
 *     URL it came from, never the raw fetched page text and never a project id;
 *   - not durable: it expires after {@link SCAN_CLAIM_TTL_DAYS} days and is
 *     single-use (the redeem consumes it), so an unredeemed token dies quietly.
 *
 *  Pure policy + minting only (node:crypto is the single import) — the storage
 *  lives behind the ./claim-store dispatcher, so this module is unit-testable
 *  without a database. */
import { randomBytes } from "node:crypto";
import type { OnboardingScanProfile } from "./types";

/** One parked public scan, keyed by its own token. */
export interface ScanClaim {
  /** 32-hex, the store's document id */
  token: string;
  /** the SANITIZED scan profile (see sanitizeScanProfile), `scannedUrl` inside */
  profile: OnboardingScanProfile;
  /** the scan's best-fit project type, when it produced one — validated against
   *  the real ProjectType set at redeem time, never trusted from here */
  suggestedType?: string;
  /** ISO timestamp the claim was minted */
  createdAt: string;
}

/** How long a minted claim stays redeemable. Long enough to survive "I'll finish
 *  this tomorrow", short enough that an abandoned scan is not a stored profile
 *  nobody asked us to keep. */
export const SCAN_CLAIM_TTL_DAYS = 7;

/** Max bytes the claim mint route accepts. A scan profile is a few KB of text;
 *  32 KB is generous headroom and still an order of magnitude below anything that
 *  could be used to fill the store from an anonymous endpoint. */
export const SCAN_CLAIM_MAX_BODY = 32 * 1024;

const DAY_MS = 86_400_000;

/** 128 bits of CSPRNG as lowercase hex — the same shape and source as the shared
 *  campaign report token (src/lib/campaigns/shared-report.ts). Unguessable is the
 *  whole security property here, so this must never fall back to Math.random. */
export function mintClaimToken(): string {
  return randomBytes(16).toString("hex");
}

/** Is this a value the store may be asked about at all? Checked BEFORE any read
 *  so a malformed/oversized wire value never reaches a document path. */
export function isClaimToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{32}$/.test(v);
}

/** Epoch ms at which a claim minted at `createdAt` stops being redeemable.
 *  An unparseable timestamp yields NaN → {@link isClaimExpired} treats the claim
 *  as expired, which is the safe direction for a bearer token. */
export function claimExpiresAt(createdAt: string): number {
  return new Date(createdAt).getTime() + SCAN_CLAIM_TTL_DAYS * DAY_MS;
}

/** Has the claim aged out? Fail-closed on a corrupt `createdAt` (NaN comparisons
 *  are false, so the negation is what makes an unreadable timestamp expire). */
export function isClaimExpired(claim: Pick<ScanClaim, "createdAt">, now: number = Date.now()): boolean {
  return !(claimExpiresAt(claim.createdAt) > now);
}

/** The cutoff ISO timestamp for a prune sweep: anything created before this is
 *  past its TTL and may be deleted. */
export function claimPruneCutoff(now: number = Date.now()): string {
  return new Date(now - SCAN_CLAIM_TTL_DAYS * DAY_MS).toISOString();
}
