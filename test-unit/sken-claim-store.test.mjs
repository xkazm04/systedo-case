/** WP W2-B — the public-scan CLAIM store on its local (node:sqlite) twin.
 *
 *  Runs the REAL dispatcher API (createScanClaim / getScanClaim / consumeScanClaim /
 *  pruneScanClaims) against the sqlite backend (table `scan_claims`, migration v28)
 *  and asserts the row really lands, so a store that silently degraded to nothing
 *  could not pass.
 *
 *  The three behaviours worth pinning are the ones a claim token exists FOR:
 *   - EXPIRY: a claim past its TTL reads as absent, whether or not a prune has run;
 *   - SINGLE USE: consume is read-and-retire, so a second redeem finds nothing —
 *     that is what makes the redeem route idempotent instead of minting a second
 *     project on a double-click;
 *   - SHAPE: a malformed token never reaches a document path at all.
 *  Sibling harness: test-unit/campaigns-local-store.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-scan-claims-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { createScanClaim, getScanClaim, consumeScanClaim, pruneScanClaims } = await import(
  "@/lib/onboarding/claim-store"
);
const { SCAN_CLAIM_TTL_DAYS, isClaimToken, isClaimExpired } = await import("@/lib/onboarding/claim-token");
const { getDb } = await import("@/lib/db");

const DAY = 86_400_000;

const profile = () => ({
  businessName: "Mionelo",
  summary: "Prodej dětských autosedaček a kočárků.",
  offering: "Autosedačky, kočárky, doplňky",
  audience: "Rodiče malých dětí",
  toneOfVoice: "Přátelský, věcný",
  keywords: ["autosedačka", "kočárek"],
  competitors: ["Kinderkraft"],
  suggestedType: "eshop",
  scannedUrl: "https://mionelo.cz",
});

const rowCount = () =>
  getDb().prepare("SELECT COUNT(*) AS n FROM scan_claims").get().n;

test("mint: the token is 32 hex, the row lands, and the profile round-trips", async () => {
  const claim = await createScanClaim(profile(), "eshop");
  assert.ok(isClaimToken(claim.token), "minted token must pass the shape check");
  assert.equal(claim.suggestedType, "eshop");

  const stored = getDb().prepare("SELECT data FROM scan_claims WHERE token = ?").get(claim.token);
  assert.ok(stored, "the row must really exist in scan_claims (no silent degrade)");

  const read = await getScanClaim(claim.token);
  assert.equal(read?.profile.businessName, "Mionelo");
  assert.equal(read?.profile.scannedUrl, "https://mionelo.cz");
  assert.deepEqual(read?.profile.keywords, ["autosedačka", "kočárek"]);
});

test("read: a malformed or unknown token is null, never a lookup", async () => {
  assert.equal(await getScanClaim("nope"), null, "malformed token");
  assert.equal(await getScanClaim(undefined), null, "absent token");
  assert.equal(await getScanClaim("f".repeat(32)), null, "well-formed but unknown token");
});

test("consume: single use — the second redeem of a token finds nothing", async () => {
  const claim = await createScanClaim(profile());
  const first = await consumeScanClaim(claim.token);
  assert.equal(first?.token, claim.token, "the first consume returns the claim");

  const gone = getDb().prepare("SELECT data FROM scan_claims WHERE token = ?").get(claim.token);
  assert.equal(gone, undefined, "consume deletes the row");
  assert.equal(await consumeScanClaim(claim.token), null, "the second consume returns null → the route 404s");
});

test("expiry: a claim past its TTL reads as absent and is retired on consume", async () => {
  const claim = await createScanClaim(profile());
  const stale = new Date(Date.now() - (SCAN_CLAIM_TTL_DAYS + 1) * DAY).toISOString();
  const data = JSON.parse(getDb().prepare("SELECT data FROM scan_claims WHERE token = ?").get(claim.token).data);
  data.createdAt = stale;
  getDb()
    .prepare("UPDATE scan_claims SET data = ?, created_at = ? WHERE token = ?")
    .run(JSON.stringify(data), stale, claim.token);

  assert.equal(isClaimExpired({ createdAt: stale }), true, "the pure policy agrees it is expired");
  assert.equal(await getScanClaim(claim.token), null, "an expired claim reads as absent");
  assert.equal(await consumeScanClaim(claim.token), null, "an expired claim cannot be redeemed");
  const swept = getDb().prepare("SELECT data FROM scan_claims WHERE token = ?").get(claim.token);
  assert.equal(swept, undefined, "the attempt that found it also cleaned it up");
});

test("prune: only rows past the TTL go, and the sweep is bounded", async () => {
  getDb().prepare("DELETE FROM scan_claims").run();
  const fresh = await createScanClaim(profile());
  const old = new Date(Date.now() - (SCAN_CLAIM_TTL_DAYS + 3) * DAY).toISOString();
  for (const token of ["a".repeat(32), "b".repeat(32)]) {
    getDb()
      .prepare("INSERT INTO scan_claims (token, data, created_at) VALUES (?, ?, ?)")
      .run(token, JSON.stringify({ token, profile: profile(), createdAt: old }), old);
  }
  assert.equal(rowCount(), 3, "two stale rows + one fresh");

  const removed = await pruneScanClaims(new Date(), 1);
  assert.equal(removed, 1, "the limit caps one sweep");
  assert.equal(rowCount(), 2);

  assert.equal(await pruneScanClaims(), 1, "the next sweep takes the other stale row");
  assert.equal(rowCount(), 1, "the fresh claim survives every sweep");
  assert.ok(await getScanClaim(fresh.token), "…and is still readable");
});
