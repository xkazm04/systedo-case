/** Bench regression (catalog-core-03): the catalog store has no serialized-byte
 *  budget. sanitizeOfferings bounds row COUNT (500) and per-string lengths, but 500
 *  max-bounded rows serialize to several MB — far over Firestore's hard 1 MiB
 *  document cap — so the production save 500s mid-write instead of being rejected
 *  up front with a typed error (the exact problem project-state already solves with
 *  PROJECT_STATE_MAX_BYTES / ProjectStateTooLargeError). This test drives the store
 *  dispatcher on its Firestore path (firebase mocked, LOCAL_DB off) and fails until
 *  an over-budget catalog is rejected BEFORE the document write.
 *
 *  Run with --experimental-test-module-mocks (firebase-admin is mocked out). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Force the dispatcher onto the Firestore backend (the production path).
delete process.env.LOCAL_DB;

/** In-memory fake of the one Firestore surface store.firestore.ts touches. */
const writes = [];
const docApi = {
  set: async (obj) => {
    writes.push(obj);
  },
  get: async () => ({ exists: false, data: () => undefined }),
  delete: async () => {},
};
const chain = {
  collection: () => chain,
  doc: () => ({ ...docApi, collection: () => chain }),
};
mock.module("@/lib/firebase", { namedExports: { firestore: chain } });

const { sanitizeOfferings } = await import("@/lib/catalog/validate");
const { saveOfferings } = await import("@/lib/catalog/store");

/** 500 plan rows at the sanitize bounds' worst case — every string at its cap. */
function oversizedCatalog() {
  const raw = Array.from({ length: 500 }, (_, i) => ({
    kind: "plan",
    id: `plan-${i}-${"i".repeat(120)}`,
    name: `Plan ${i} ${"n".repeat(200)}`,
    category: "c".repeat(120),
    active: true,
    price: 999,
    interval: "month",
    channels: Array.from({ length: 20 }, (_, j) => `ch${j}-${"x".repeat(76)}`),
    tags: Array.from({ length: 20 }, (_, j) => `tag${j}-${"y".repeat(154)}`),
    competitors: Array.from({ length: 30 }, (_, j) => ({
      name: `comp${j}-${"z".repeat(113)}`,
      url: `https://example.com/${"u".repeat(280)}`,
      price: 100,
    })),
    differentiators: Array.from({ length: 20 }, (_, j) => `d${j}-${"w".repeat(196)}`),
  }));
  return sanitizeOfferings(raw, "p1");
}

test("control: a normal-sized catalog saves through the Firestore path", async () => {
  const small = sanitizeOfferings(
    [{ kind: "product", name: "Kešu", category: "Ořechy", price: 249, sku: "K-1", stock: 5, dailyVelocity: 1, channels: [], tags: [] }],
    "p1"
  );
  await saveOfferings("u1", "p1", small);
  assert.equal(writes.length, 1, "the small catalog reached the document write");
});

test("an over-1MiB sanitized catalog is rejected with a typed error, not handed to Firestore", async () => {
  const catalog = oversizedCatalog();
  const bytes = Buffer.byteLength(JSON.stringify(catalog), "utf8");
  // Precondition (passes today): sanitize happily produces a blob far over the
  // 1 MiB Firestore document cap.
  assert.ok(
    bytes > 1_048_576,
    `precondition: sanitized max-bounded catalog must exceed 1 MiB (got ${bytes} bytes)`
  );

  const before = writes.length;
  // The defect: no byte budget anywhere in store.ts / store.firestore.ts — the save
  // resolves and hands the oversized blob straight to the (mocked) document write.
  await assert.rejects(
    () => saveOfferings("u1", "p1", catalog),
    (err) => {
      assert.ok(err instanceof Error, "rejection must be a typed Error");
      return true;
    },
    `saveOfferings must reject an over-budget catalog (${bytes} bytes) before writing the document`
  );
  assert.equal(writes.length, before, "the oversized blob must never reach the document write");
});
