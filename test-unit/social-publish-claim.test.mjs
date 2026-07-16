/** Publishing-limbo fix — the "publishing" claim is a dated LEASE, not a one-way
 *  door (social/types.ts). A post flipped scheduled→publishing whose claimer
 *  crashed must become recoverable once the lease ages out: isStalePublishClaim
 *  is the pure decision the cron's stale-claim sweep (reclaimStalePublishing)
 *  acts on. No I/O here — the sweep itself is document access in social/store. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStalePublishClaim, PUBLISH_CLAIM_TTL_MS } from "@/lib/social/types";

test("a missing or unparseable claim stamp is stale (legacy claims must be recoverable, never stuck)", () => {
  assert.equal(isStalePublishClaim(undefined, Date.now()), true);
  assert.equal(isStalePublishClaim("not-a-date", Date.now()), true);
});

test("a fresh claim is a live publish — leave it alone", () => {
  const now = 10 * PUBLISH_CLAIM_TTL_MS;
  assert.equal(isStalePublishClaim(new Date(now - 1000).toISOString(), now), false);
});

test("a claim past the TTL is stranded — the sweep may settle it", () => {
  const now = 10 * PUBLISH_CLAIM_TTL_MS;
  assert.equal(isStalePublishClaim(new Date(now - PUBLISH_CLAIM_TTL_MS - 1000).toISOString(), now), true);
  // exactly at the boundary counts as stale
  assert.equal(isStalePublishClaim(new Date(now - PUBLISH_CLAIM_TTL_MS).toISOString(), now), true);
});

test("the lease outlives the cron route's maxDuration (300 s) so a live run is never reclaimed", () => {
  assert.ok(PUBLISH_CLAIM_TTL_MS >= 2 * 300_000);
});
