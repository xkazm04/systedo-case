/** Direction 1 — Sklik as a real citizen. Covers the pieces provable offline:
 *   - provider-registry resolution ORDER (chooseAdsSource precedence table);
 *   - the scheduled sync's fan-out UNION (Sklik-only users now included, deduped);
 *   - the per-user token store round-trip + that the client-safe view never leaks
 *     the encrypted token (token roundtrip sanitization);
 *   - the stable `sklik` tenant suffix that drift-proofs Sklik history against a
 *     later Google connection.
 *  The sqlite backend is exercised directly (like catalog-connection.test.mjs), so
 *  no Firestore/network is touched. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAdsSource, unionConnectedUserIds } from "@/lib/campaigns/provider-precedence";
import { buildTenantKey, SKLIK_TENANT_SUFFIX } from "@/lib/campaigns/store-keys";
import { publicSklikConnection } from "@/lib/campaigns/sklik-connection";
import { encryptToken, decryptToken } from "@/lib/inventory/token-crypto";
import {
  deleteSklikConnection,
  getSklikConnection,
  listSklikConnectedUserIds,
  saveSklikConnection,
} from "@/lib/campaigns/sklik-connection.local.ts";

test("provider precedence: Google-first, Sklik only without a Google account, else sample", () => {
  // Google wins whenever fully credentialed — even if a Sklik token is also present.
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: true, googleConfigured: true, hasGoogleToken: true, hasSklikToken: true }),
    "google-ads"
  );
  // A connected Google account but no dev token / no OAuth token → not live Google.
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: true, googleConfigured: false, hasGoogleToken: true, hasSklikToken: true }),
    "sample"
  );
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: true, googleConfigured: true, hasGoogleToken: false, hasSklikToken: false }),
    "sample"
  );
  // No Google account + a Sklik token → Sklik.
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: false, googleConfigured: false, hasGoogleToken: false, hasSklikToken: true }),
    "sklik"
  );
  // Nothing → sample.
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: false, googleConfigured: true, hasGoogleToken: false, hasSklikToken: false }),
    "sample"
  );
  // Sklik NEVER overrides a Google connection (Google-first), so a Sklik token on a
  // Google user is inert.
  assert.equal(
    chooseAdsSource({ hasGoogleConnection: true, googleConfigured: true, hasGoogleToken: true, hasSklikToken: false }),
    "google-ads"
  );
});

test("cron fan-out union: Sklik-only users are included, dupes collapse, order stable", () => {
  assert.deepEqual(unionConnectedUserIds(["g1", "g2"], ["s1"]), ["g1", "g2", "s1"]);
  // A user connected to BOTH appears exactly once (no double sync target).
  assert.deepEqual(unionConnectedUserIds(["u1", "u2"], ["u2", "u3"]), ["u1", "u2", "u3"]);
  // A pure Sklik deployment (no Google users) still fans out.
  assert.deepEqual(unionConnectedUserIds([], ["s1", "s2"]), ["s1", "s2"]);
});

test("stable sklik tenant suffix: a later Google connection cannot orphan Sklik history", () => {
  const uid = "u_sklik";
  const pid = "projA";
  // Before Google: Sklik history keys under the fixed `_sklik` suffix.
  const sklikTenant = buildTenantKey(uid, pid, SKLIK_TENANT_SUFFIX);
  assert.equal(sklikTenant, `u_${uid}_proj_${pid}_${SKLIK_TENANT_SUFFIX}`);
  // Later Google connect lands under its OWN customer-id tenant — a DIFFERENT key, so
  // it never overwrites or collides with the preserved Sklik tenant.
  const googleTenant = buildTenantKey(uid, pid, "123-456-7890");
  assert.notEqual(googleTenant, sklikTenant);
  // The Sklik key is deterministic from the fixed suffix, so it stays addressable
  // when Google is disconnected again.
  assert.equal(buildTenantKey(uid, pid, SKLIK_TENANT_SUFFIX), sklikTenant);
});

test("publicSklikConnection: never leaks the encrypted token, keeps status", () => {
  assert.deepEqual(publicSklikConnection(null), { connected: false });
  const pub = publicSklikConnection({
    tokenEnc: "v2.salt.iv.tag.ct",
    connectedAt: "2026-07-15T00:00:00.000Z",
    halereConfirmed: true,
    halereConfirmedAt: "2026-07-15T01:00:00.000Z",
  });
  assert.equal(pub.connected, true);
  assert.equal(pub.connectedAt, "2026-07-15T00:00:00.000Z");
  assert.equal(pub.halereConfirmed, true);
  assert.equal("tokenEnc" in pub, false); // the token never reaches the client
});

test("sqlite token store: round-trips the encrypted token, lists + deletes", async () => {
  process.env.CATALOG_TOKEN_SECRET = "unit-test-secret-please-ignore";
  const uid = "sklik-store-user";
  const plain = "sklik-live-token-XYZ789";
  const tokenEnc = encryptToken(plain);
  assert.match(tokenEnc, /^v2\./); // encrypted at rest, per-token salt

  await saveSklikConnection(uid, { tokenEnc, connectedAt: "2026-07-15T00:00:00.000Z" });
  const c = await getSklikConnection(uid);
  assert.ok(c);
  assert.equal(c.tokenEnc, tokenEnc);
  // The stored blob decrypts back to the original secret (round trip).
  assert.equal(decryptToken(c.tokenEnc), plain);

  // Listed among the fan-out user ids.
  assert.ok((await listSklikConnectedUserIds()).includes(uid));

  // Re-connect preserves a confirmed haléře setting (per the route), and the store
  // persists the Direction-3 fields.
  await saveSklikConnection(uid, {
    ...c,
    halereConfirmed: true,
    halereConfirmedAt: "2026-07-15T02:00:00.000Z",
    moneyVerdict: "halere-suspected",
  });
  const c2 = await getSklikConnection(uid);
  assert.equal(c2.halereConfirmed, true);
  assert.equal(c2.moneyVerdict, "halere-suspected");

  await deleteSklikConnection(uid);
  assert.equal(await getSklikConnection(uid), null);
  assert.ok(!(await listSklikConnectedUserIds()).includes(uid));
});
