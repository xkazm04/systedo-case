/** Unit tests for the catalog persistence layer (Phase 2b):
 *  - sanitizeOfferings: the trust boundary — drop malformed rows, clamp numbers,
 *    bound strings, coerce enums, cap array length, force projectId.
 *  - the local node:sqlite store: save→list round-trips, empty is honored, and a
 *    never-saved project reads back null (so the loader falls back to the seed). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { listOfferings, saveOfferings } from "@/lib/catalog/store.local.ts";

test("sanitizeOfferings drops malformed rows and coerces/clamps fields", () => {
  const out = sanitizeOfferings(
    [
      { kind: "bogus" }, // invalid kind → dropped
      null, // not an object → dropped
      42, // not an object → dropped
      {
        kind: "product",
        name: "Kešu",
        category: "Ořechy",
        price: -10, // clamp → 0
        margin: 5, // clamp → 1
        nature: "weird", // coerce → online
        source: "hacker", // coerce → manual
        sku: "MIO-1",
        stock: 3,
        dailyVelocity: 1,
        channels: ["Zboží.cz", 99], // non-strings dropped
        tags: [],
      },
    ],
    "proj-1"
  );
  assert.equal(out.length, 1);
  const p = out[0];
  assert.equal(p.kind, "product");
  assert.equal(p.projectId, "proj-1"); // forced, never trusted from input
  assert.equal(p.price, 0);
  assert.equal(p.margin, 1);
  assert.equal(p.nature, "online");
  assert.equal(p.source, "manual");
  assert.deepEqual(p.channels, ["Zboží.cz"]);
});

test("sanitizeOfferings bounds strings and caps array length", () => {
  const longName = "x".repeat(500);
  const many = Array.from({ length: 600 }, (_, i) => ({
    kind: "service",
    name: `s${i}`,
    price: 1,
    priceModel: "nonsense", // coerce → from
    serviceAreas: ["praha"],
  }));
  const named = sanitizeOfferings([{ kind: "plan", name: longName, price: 1, interval: "decade" }], "p");
  assert.equal(named[0].name.length, 200);
  assert.equal(named[0].kind === "plan" && named[0].interval, "month"); // coerced

  const capped = sanitizeOfferings(many, "p");
  assert.equal(capped.length, 500);
  assert.equal(capped[0].kind === "service" && capped[0].priceModel, "from");
});

test("sqlite catalog store round-trips save → list", async () => {
  const uid = "test-catalog-user";
  const pid = "test-catalog-proj";
  const offerings = sanitizeOfferings(
    [{ kind: "product", name: "Kešu test", category: "Ořechy", price: 249, sku: "MIO-TEST", stock: 10, dailyVelocity: 2, nature: "online", margin: 0.3 }],
    pid
  );
  await saveOfferings(uid, pid, offerings);
  const back = await listOfferings(uid, pid);
  assert.ok(back, "expected a saved catalog");
  assert.equal(back.length, 1);
  assert.equal(back[0].name, "Kešu test");
  assert.equal(back[0].kind, "product");

  // Saving an explicitly-empty catalog is honored (not treated as never-saved).
  await saveOfferings(uid, pid, []);
  assert.deepEqual(await listOfferings(uid, pid), []);
});

test("listOfferings returns null for a never-saved project (→ seed fallback)", async () => {
  assert.equal(await listOfferings("test-catalog-user-none", "never-saved-proj"), null);
});
