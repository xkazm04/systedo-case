/** Unit tests for the scheduled re-sync building blocks: resolveProviderProducts
 *  (demo works with no token; baselinker requires one; unknown throws) and
 *  listAllConnections (the cron's cross-user work list). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProviderProducts, messageForResult } from "@/lib/inventory/sync";
import {
  deleteConnection,
  listAllConnections,
  saveConnection,
} from "@/lib/inventory/connection-store.local.ts";

test("resolveProviderProducts: demo needs no token; baselinker + unknown reject", async () => {
  const demo = await resolveProviderProducts("demo", "", undefined, new Date("2026-07-05T00:00:00Z"));
  assert.ok(demo.products.length >= 6);
  assert.ok(demo.products[0].sku && demo.products[0].price >= 0);
  assert.equal(demo.truncated, false); // demo is always a complete pull
  await assert.rejects(() => resolveProviderProducts("baselinker", "", undefined, new Date("2026-07-05T00:00:00Z")));
  await assert.rejects(() => resolveProviderProducts("bogus", "", undefined, new Date("2026-07-05T00:00:00Z")));
});

test("messageForResult: prefers an explicit message, else a localized code text (never the raw code)", () => {
  // A code with no message → a human Czech sentence, not the bare token.
  assert.equal(messageForResult({ code: "empty" }), "Zdroj nevrátil žádné produkty — katalog nebyl změněn.");
  assert.equal(messageForResult({ code: "no-token" }), "Chybí API token pro připojení ke skladu.");
  assert.ok(!/^[a-z-]+$/.test(messageForResult({ code: "unknown-provider" })), "not a raw machine code");
  // An explicit message wins over the code map.
  assert.equal(messageForResult({ code: "provider-error", message: "Baselinker: 401" }), "Baselinker: 401");
  assert.equal(messageForResult({ code: "ok" }), "");
});

test("listAllConnections returns every stored connection with its owner keys", async () => {
  const u1 = "cron-test-u1";
  const u2 = "cron-test-u2";
  const p = "cron-test-p";
  await saveConnection(u1, p, { provider: "demo", connectedAt: "2026-07-05T00:00:00.000Z" });
  await saveConnection(u2, p, { provider: "baselinker", tokenEnc: "v1.x.y.z", connectedAt: "2026-07-05T00:00:00.000Z" });

  const mine = (await listAllConnections()).filter((c) => c.userId === u1 || c.userId === u2);
  assert.equal(mine.length, 2);
  const byUser = Object.fromEntries(mine.map((c) => [c.userId, c]));
  assert.equal(byUser[u1].projectId, p);
  assert.equal(byUser[u1].connection.provider, "demo");
  assert.equal(byUser[u2].connection.provider, "baselinker");
  assert.equal(byUser[u2].connection.tokenEnc, "v1.x.y.z"); // stays encrypted in the sweep

  await deleteConnection(u1, p);
  await deleteConnection(u2, p);
});
