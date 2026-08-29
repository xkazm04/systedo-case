/** WP W1-A — the change ledger's two ROUTE write paths, driven end-to-end through
 *  the real handlers: `POST /catalog/import` (a feed apply) and `PUT /catalog` (a
 *  manual save). Together with the warehouse-sync coverage in catalog-sync.test.mjs
 *  this pins all three appenders.
 *
 *  The ownership guard, the catalog store, the ledger store and the activity emitter
 *  are mocked (no auth, no Firestore, no sqlite) so the route seams are unit-testable;
 *  the merge, the sanitizer and the detector are the real ones. Run with
 *  --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const UID = "u1";
const PID = "p1";

const LEDGER = [];
let stored = [];
const ACTIVITY = [];

mock.module("@/lib/projects/api-guard", {
  namedExports: {
    requireOwnedProject: async () => ({
      uid: UID,
      project: { id: PID, name: "Test", type: "eshop", accentColor: "#fff", createdAt: "x", updatedAt: "x" },
    }),
  },
});
mock.module("@/lib/catalog/store", {
  namedExports: {
    listOfferings: async () => stored,
    saveOfferings: async (_u, _p, offerings) => {
      stored = offerings;
    },
    deleteCatalog: async () => {},
  },
});
mock.module("@/lib/catalog/events-store", {
  namedExports: {
    appendCatalogEvents: async (_u, _p, events) => {
      LEDGER.push(...events);
    },
    listCatalogEvents: async () => [],
    clearCatalogEvents: async () => {},
  },
});
// The fixed-window limiter is sqlite-backed and SHARED across the suite; the ledger
// has nothing to do with it, so it is stubbed open rather than exercised (which also
// keeps this file off the `@/lib/db` import chain).
mock.module("@/lib/ai/rate-limit", {
  namedExports: {
    rateLimit: () => ({ ok: true, retryAfter: 0 }),
    tooManyRequests: (retryAfter, message) => Response.json({ error: message }, { status: 429 }),
    tooLarge: () => false,
    payloadTooLarge: (message) => Response.json({ error: message }, { status: 413 }),
  },
});
mock.module("@/lib/activity/emit", {
  namedExports: {
    emitProjectActivity: async (_u, _p, entry) => {
      ACTIVITY.push(entry);
    },
  },
});

const { POST: importPost } = await import("@/app/api/projects/[id]/catalog/import/route.ts");
const { PUT: catalogPut } = await import("@/app/api/projects/[id]/catalog/route.ts");

const params = Promise.resolve({ id: PID });
const post = (url, body) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const CSV = `sku;název;cena;kategorie;ean;sklad;dostupnost
CSV-1;Vlašské ořechy;199;Ořechy;8590000000003;73;skladem
CSV-2;Dýňová semínka;129;Semínka;;6;1`;

const CSV_REPRICED = `sku;název;cena;kategorie;ean;sklad;dostupnost
CSV-1;Vlašské ořechy;249;Ořechy;8590000000003;40;skladem
CSV-2;Dýňová semínka;129;Semínka;;6;1`;

const kinds = (events) => events.map((e) => e.kind).sort();

test("POST /catalog/import (preview) leaves the ledger untouched", async () => {
  LEDGER.length = 0;
  stored = [];
  const res = await importPost(post("http://t/api/projects/p1/catalog/import", { content: CSV, mode: "preview" }), { params });
  const json = await res.json();
  assert.equal(json.applied, false);
  assert.equal(LEDGER.length, 0, "a preview writes no history");
});

test("POST /catalog/import (apply) appends one `added` per new SKU", async () => {
  LEDGER.length = 0;
  ACTIVITY.length = 0;
  stored = [];
  const res = await importPost(post("http://t/api/projects/p1/catalog/import", { content: CSV, mode: "apply" }), { params });
  const json = await res.json();
  assert.equal(json.applied, true);
  assert.equal(LEDGER.length, 2);
  assert.deepEqual(kinds(LEDGER), ["added", "added"]);
  assert.deepEqual(LEDGER.map((e) => e.key).sort(), ["CSV-1", "CSV-2"]);
  assert.ok(LEDGER.every((e) => e.actor === "feed-import"), "the feed path stamps its own actor");
  assert.equal(LEDGER[0].provider, undefined, "provider is a warehouse-only field");
  // the rollup reaches the project activity feed's detail line
  assert.match(ACTIVITY.at(-1).detail, /\+2/);
});

test("POST /catalog/import (apply, re-import) reports only what the feed actually moved", async () => {
  LEDGER.length = 0;
  const res = await importPost(post("http://t/api/projects/p1/catalog/import", { content: CSV_REPRICED, mode: "apply" }), { params });
  assert.equal((await res.json()).applied, true);
  const one = LEDGER.filter((e) => e.key === "CSV-1");
  assert.deepEqual(kinds(one), ["price", "stock"]);
  assert.equal(one.find((e) => e.kind === "price").before, 199);
  assert.equal(one.find((e) => e.kind === "price").after, 249);
  assert.equal(LEDGER.some((e) => e.key === "CSV-2"), false, "an unchanged SKU produces no noise");
});

test("PUT /catalog appends `manual` events for a hand-edited offering", async () => {
  LEDGER.length = 0;
  ACTIVITY.length = 0;
  const edited = stored.map((o) =>
    o.sku === "CSV-2" ? { ...o, name: "Dýňová semínka BIO", price: 149, active: false } : o
  );
  const res = await catalogPut(
    new Request("http://t/api/projects/p1/catalog", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerings: edited }),
    }),
    { params }
  );
  assert.equal((await res.json()).ok, true);
  const two = LEDGER.filter((e) => e.key === "CSV-2");
  assert.deepEqual(kinds(two), ["active", "price", "renamed"]);
  assert.ok(two.every((e) => e.actor === "manual"), "the PUT path stamps the manual actor");
  assert.equal(two.find((e) => e.kind === "renamed").after, "Dýňová semínka BIO");
  assert.match(ACTIVITY.at(-1).detail, /cena/);
});

test("PUT /catalog reports a dropped offering as `removed`", async () => {
  LEDGER.length = 0;
  const res = await catalogPut(
    new Request("http://t/api/projects/p1/catalog", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerings: stored.filter((o) => o.sku !== "CSV-1") }),
    }),
    { params }
  );
  assert.equal((await res.json()).count, 1);
  assert.deepEqual(kinds(LEDGER), ["removed"]);
  assert.equal(LEDGER[0].key, "CSV-1");
  assert.equal(LEDGER[0].name, "Vlašské ořechy");
});
