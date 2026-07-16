/** Direction 1 (memoization boundary) — the pure per-request memo seam of
 *  src/lib/patterns/store.ts (memoizeLoad), exercised with counting loaders (no store,
 *  no network). One request-scoped cache → a single underlying load for repeat keys;
 *  NO cache (undefined) → every call loads afresh, the byte-identical default that keeps
 *  mining fresh per request. getLibrary/getPatternLines thread this same cache so the
 *  batch analyze route pays for one store scan across the whole portfolio walk. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoizeLoad } from "@/lib/patterns/store.ts";

test("memoizeLoad: the same key loads once and both callers share the result", async () => {
  const cache = new Map();
  let loads = 0;
  const loader = async () => {
    loads++;
    return { n: loads };
  };
  // Kick off two calls before either resolves — both must share the one in-flight promise.
  const [a, b] = await Promise.all([
    memoizeLoad(cache, "k", loader),
    memoizeLoad(cache, "k", loader),
  ]);
  const c = await memoizeLoad(cache, "k", loader); // and a later sequential call, too
  assert.equal(loads, 1, "loader invoked exactly once for the shared key");
  assert.deepEqual(a, { n: 1 });
  assert.deepEqual(b, { n: 1 });
  assert.deepEqual(c, { n: 1 });
});

test("memoizeLoad: distinct keys load independently", async () => {
  const cache = new Map();
  let loads = 0;
  const loader = async () => ({ n: ++loads });
  await memoizeLoad(cache, "a", loader);
  await memoizeLoad(cache, "b", loader);
  assert.equal(loads, 2);
});

test("memoizeLoad: no cache (undefined) → every call loads afresh (byte-identical default)", async () => {
  let loads = 0;
  const loader = async () => ({ n: ++loads });
  await memoizeLoad(undefined, "k", loader);
  await memoizeLoad(undefined, "k", loader);
  assert.equal(loads, 2, "without a request cache the mining stays fresh per call");
});
