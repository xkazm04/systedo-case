/** Catalog store serialized-byte budget (src/lib/catalog/store.ts dispatcher):
 *  a catalog that serializes past CATALOG_MAX_BYTES is rejected with the typed
 *  CatalogTooLargeError BEFORE it reaches a backend — so the local (uncapped
 *  sqlite) and Firestore (1 MiB doc cap) backends fail identically, instead of
 *  an oversized catalog 500-ing only in production. Mirrors the project-state
 *  store's PROJECT_STATE_MAX_BYTES / ProjectStateTooLargeError guard. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

// Point the local db at a throwaway file BEFORE the store lazily opens it, and
// route the dispatcher to the node:sqlite backend (never exercises Firestore).
const dbFile = join(tmpdir(), "systedo-catalog-too-large-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { saveOfferings, listOfferings, CATALOG_MAX_BYTES, CatalogTooLargeError } =
  await import("@/lib/catalog/store");
const { sanitizeOfferings } = await import("@/lib/catalog/validate");
const { MAX_OFFERINGS } = await import("@/lib/catalog/offering");

const U = "user-toobig";
const P = "proj-toobig";

// A single plan row at every sanitize-bounded maximum — the per-row worst case a
// legitimate (fully sanitized) catalog can contain (~20 KB).
const MAX_ROW = {
  kind: "plan",
  id: "i".repeat(128),
  name: "n".repeat(200),
  category: "c".repeat(120),
  price: 1,
  interval: "month",
  channels: Array.from({ length: 20 }, (_, i) => "ch" + "x".repeat(78) + i),
  tags: Array.from({ length: 20 }, (_, i) => "tg" + "x".repeat(158) + i),
  competitors: Array.from({ length: 30 }, (_, i) => ({
    name: "co" + "x".repeat(118) + i,
    url: "u" + "x".repeat(298) + i,
    price: 1,
  })),
  differentiators: Array.from({ length: 20 }, (_, i) => "d" + "x".repeat(198) + i),
};

test("a catalog serializing past CATALOG_MAX_BYTES is rejected with CatalogTooLargeError before the backend", async () => {
  const rowBytes = Buffer.byteLength(JSON.stringify(MAX_ROW), "utf8");
  assert.ok(rowBytes > 0);
  // Fill the budget with max-bounded sanitized rows (round down so the catalog is a
  // whole number of rows), then verify it is indeed over the budget.
  const count = Math.floor(CATALOG_MAX_BYTES / rowBytes);
  const offerings = sanitizeOfferings(Array.from({ length: count }, () => ({ ...MAX_ROW })), P);
  const bytes = Buffer.byteLength(JSON.stringify(offerings), "utf8");
  assert.ok(bytes > CATALOG_MAX_BYTES, `expected ${bytes} > ${CATALOG_MAX_BYTES}`);

  await assert.rejects(
    () => saveOfferings(U, P, offerings),
    (err) =>
      err instanceof CatalogTooLargeError &&
      err.name === "CatalogTooLargeError" &&
      err.bytes === bytes
  );
});

test("nothing was written when the oversized save was rejected (→ seed fallback)", async () => {
  assert.equal(await listOfferings(U, P), null);
});

test("a catalog under the budget still saves (and round-trips)", async () => {
  const offerings = sanitizeOfferings([{ ...MAX_ROW }], "proj-under");
  const bytes = Buffer.byteLength(JSON.stringify(offerings), "utf8");
  assert.ok(bytes < CATALOG_MAX_BYTES);
  await saveOfferings(U, "proj-under", offerings);
  const back = await listOfferings(U, "proj-under");
  assert.equal(back?.length, 1);
});

test("the budget is strictly below Firestore's 1 MiB document cap", () => {
  assert.ok(CATALOG_MAX_BYTES < 1024 * 1024, "budget must leave headroom under the 1 MiB cap");
});

test("sanitize still caps row count at MAX_OFFERINGS — the budget is the byte guard, not a row cap", () => {
  const rows = sanitizeOfferings(Array.from({ length: MAX_OFFERINGS + 100 }, (_, i) => ({ kind: "product", name: `p${i}` })), "p2");
  assert.equal(rows.length, MAX_OFFERINGS);
});
