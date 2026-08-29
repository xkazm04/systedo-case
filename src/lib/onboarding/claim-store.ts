/** The public-scan claim store — backend dispatcher (ADR-0001). Local node:sqlite
 *  when LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the
 *  LOCAL_DB path never evaluates the Firestore module. Server-only.
 *
 *  KEYING: like the microsite registry (src/lib/microsite/store.ts) this store is
 *  GLOBAL, not per-tenant — a claim is minted before any account exists, so there
 *  is no tenant to key it by. The key is the 128-bit token itself, which is what
 *  makes a claim addressable in exactly one read and unguessable to everyone else.
 *  No cascade entry is needed: rows are user-free and self-expiring.
 *
 *  ALL POLICY LIVES HERE, not in the backends: minting, the TTL check on read, the
 *  get-then-delete of a consume, and the opportunistic prune. The two backends are
 *  four dumb operations (get / put / delete / prune-before), so they cannot drift
 *  on the security-relevant half the way two hand-written expiry checks would. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { OnboardingScanProfile } from "./types";
import {
  claimPruneCutoff,
  isClaimExpired,
  isClaimToken,
  mintClaimToken,
  type ScanClaim,
} from "./claim-token";

/** What both backends owe. Storage only — no expiry logic, no minting. */
export interface ClaimBackend {
  getClaim(token: string): Promise<ScanClaim | null>;
  putClaim(claim: ScanClaim): Promise<void>;
  deleteClaim(token: string): Promise<void>;
  /** Delete claims created strictly before `cutoffIso`; returns how many went. */
  pruneClaims(cutoffIso: string, limit: number): Promise<number>;
}

function backend(): Promise<ClaimBackend> {
  return LOCAL_DB ? import("./claim-store.local") : import("./claim-store.firestore");
}

/** How many stale rows one opportunistic sweep removes. Bounded so a mint never
 *  turns into an unbounded delete (Firestore charges per document). */
const PRUNE_BATCH = 25;

/** Park a sanitized scan profile under a fresh token and return the whole claim.
 *  Opportunistically prunes expired rows first — best-effort, because a failed
 *  housekeeping sweep must never stop a visitor from claiming their own scan. */
export async function createScanClaim(
  profile: OnboardingScanProfile,
  suggestedType?: string,
  now: Date = new Date()
): Promise<ScanClaim> {
  const be = await backend();
  try {
    await be.pruneClaims(claimPruneCutoff(now.getTime()), PRUNE_BATCH);
  } catch {
    /* housekeeping only — never fails the mint */
  }
  const claim: ScanClaim = {
    token: mintClaimToken(),
    profile,
    ...(suggestedType ? { suggestedType } : {}),
    createdAt: now.toISOString(),
  };
  await be.putClaim(claim);
  return claim;
}

/** Read a claim WITHOUT consuming it. Null when the token is malformed, unknown,
 *  or past its TTL — an expired row reads as absent on both backends (the store
 *  may still hold it until a prune sweep; that is a storage detail, never a
 *  readable one). */
export async function getScanClaim(token: unknown): Promise<ScanClaim | null> {
  if (!isClaimToken(token)) return null;
  const claim = await (await backend()).getClaim(token);
  if (!claim) return null;
  return isClaimExpired(claim) ? null : claim;
}

/** Read-and-retire: the redeem path's single-use door. Deletes the row on ANY
 *  hit — expired ones included, so a stale token is cleaned up by the attempt
 *  that found it — and returns the claim only when it was still valid. A second
 *  redeem of the same token therefore finds nothing, which is what makes the
 *  redeem idempotent (the second call 404s instead of minting a second project).
 *
 *  "Atomic enough" by construction rather than by transaction: the token is
 *  128 bits of CSPRNG known only to its holder, so the only racer is the same
 *  visitor double-clicking, and both branches of that race end with one project
 *  and a consumed token (the loser's `getClaim` returns null, or its delete is a
 *  no-op and its caller sees the same claim — see the redeem route, which keys
 *  every write off `currentUserId()`). */
export async function consumeScanClaim(token: unknown): Promise<ScanClaim | null> {
  if (!isClaimToken(token)) return null;
  const be = await backend();
  const claim = await be.getClaim(token);
  if (!claim) return null;
  await be.deleteClaim(token);
  return isClaimExpired(claim) ? null : claim;
}

/** Sweep expired rows. Called opportunistically by {@link createScanClaim};
 *  exported so a test (or a future cron) can drive it explicitly. */
export async function pruneScanClaims(now: Date = new Date(), limit: number = PRUNE_BATCH): Promise<number> {
  return (await backend()).pruneClaims(claimPruneCutoff(now.getTime()), limit);
}
