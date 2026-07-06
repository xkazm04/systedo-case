/** Unit tests for the per-user catalog rate limiter: it allows up to the configured
 *  cap, then returns a 429 with Retry-After, and budgets are independent per user. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_RATE, enforceCatalogRate } from "@/lib/catalog/rate-limit";

test("enforceCatalogRate: allows up to the limit, then 429s with Retry-After", () => {
  process.env.CATALOG_SYNC_PER_MIN = "3";
  const rule = CATALOG_RATE.sync();
  const uid = "rl-user-a";
  assert.equal(enforceCatalogRate(uid, rule), null);
  assert.equal(enforceCatalogRate(uid, rule), null);
  assert.equal(enforceCatalogRate(uid, rule), null);
  const blocked = enforceCatalogRate(uid, rule);
  assert.ok(blocked, "4th request should be blocked");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
});

test("enforceCatalogRate: each user has an independent budget", () => {
  process.env.CATALOG_SYNC_PER_MIN = "1";
  const rule = CATALOG_RATE.sync();
  assert.equal(enforceCatalogRate("rl-user-b", rule), null); // b's first — ok
  assert.ok(enforceCatalogRate("rl-user-b", rule)); // b's second — blocked
  assert.equal(enforceCatalogRate("rl-user-c", rule), null); // c is unaffected
});
