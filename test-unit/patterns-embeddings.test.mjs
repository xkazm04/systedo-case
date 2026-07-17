/** Direction 1 — embeddings grow up (src/lib/patterns/embeddings.ts). Three seams:
 *  (a) embedOne has an AbortController timeout, so a hung Gemini request aborts and the
 *      batch resolves to the deterministic no-embeddings fallback (null) exactly as a
 *      thrown fetch does today — instead of stalling the whole ads/eval request;
 *  (b) the vector cache is LRU (a read touches its entry → most-recently-used), so a hot
 *      query isn't evicted just because the corpus churned newer keys past it;
 *  (c) the memoization boundary lives in store.ts (memoizeLoad) — tested there.
 *  All with a mocked fetch + a tiny env-shortened timeout — no network, no real key. */
import { test } from "node:test";
import assert from "node:assert/strict";

// Shorten the abort budget BEFORE importing the module under test (embedTimeoutMs reads
// the env per call, so this stays fast: ~20 ms instead of 3 s).
process.env.PATTERNS_EMBED_TIMEOUT_MS = "20";
process.env.GEMINI_API_KEY = "test-key"; // gate open so embedTexts actually calls fetch

const { embedTexts, makeLru } = await import("@/lib/patterns/embeddings.ts");

/** Swap global.fetch; returns a restore fn. `impl(url, opts)` supplies the response. */
function stubFetch(impl) {
  const original = global.fetch;
  global.fetch = impl;
  return () => (global.fetch = original);
}

// --- (a) timeout → deterministic fallback -------------------------------------

test("embedTexts: a hung fetch aborts on timeout and resolves to the null fallback", async () => {
  // A fetch that never responds on its own — it only settles when the abort signal fires,
  // rejecting like a real aborted fetch. Without the timeout this would hang forever.
  const restore = stubFetch(
    (_url, opts) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
  );
  try {
    const t0 = Date.now();
    const out = await embedTexts(["a novel query never cached"]);
    assert.equal(out, null, "aborted embedding → null → deterministic ordering fallback");
    assert.ok(Date.now() - t0 < 2000, "returned promptly via the ~20ms test timeout, did not hang");
  } finally {
    restore();
  }
});

test("embedTexts: a thrown fetch (network error) also yields the null fallback", async () => {
  const restore = stubFetch(async () => {
    throw new Error("ECONNRESET");
  });
  try {
    assert.equal(await embedTexts(["another uncached query"]), null);
  } finally {
    restore();
  }
});

// --- (b) LRU touch-on-read ----------------------------------------------------
//
// Covered by the pure makeLru tests below (the same LRU the vector cache uses). A
// live successful embed is intentionally NOT asserted here: it records best-effort
// telemetry via a Firestore write whose detached retry can outlive the test in a
// no-credentials sandbox — an environmental leak, not behaviour under test.

test("makeLru: a read touches its entry so it survives eviction (LRU, not FIFO)", () => {
  const lru = makeLru(2);
  lru.set("a", [1]);
  lru.set("b", [2]);
  // Read "a" — under FIFO it would still be the oldest; under LRU this promotes it.
  assert.deepEqual(lru.get("a"), [1]);
  lru.set("c", [3]); // over capacity → evict the least-recently-used, which is now "b"
  assert.equal(lru.size, 2);
  assert.deepEqual([...lru.keys()], ["a", "c"], "b evicted (LRU), a kept because it was read");
});

test("makeLru: without a read, the oldest is evicted (baseline ordering)", () => {
  const lru = makeLru(2);
  lru.set("a", [1]);
  lru.set("b", [2]);
  lru.set("c", [3]); // no read of "a" → "a" is oldest and evicted
  assert.deepEqual([...lru.keys()], ["b", "c"]);
});

test("makeLru: re-setting an existing key refreshes recency and never grows past max", () => {
  const lru = makeLru(2);
  lru.set("a", [1]);
  lru.set("b", [2]);
  lru.set("a", [9]); // update "a" → most-recently-used
  lru.set("c", [3]); // evict LRU, which is "b"
  assert.equal(lru.size, 2);
  assert.deepEqual([...lru.keys()], ["a", "c"]);
  assert.deepEqual(lru.get("a"), [9], "value updated in place");
});

// --- partial-batch: one failing sibling must not discard the paid successes ----
//
// Before: embedTexts used Promise.all + `fresh.every(v=>v.length>0)` so a single
// empty/timed-out vector returned null BEFORE the cache-write loop — every other
// paid vector was thrown away, nothing cached, spend untelemetered. Now each
// fulfilled non-empty vector is cached even on an incomplete batch, so a retry
// only re-embeds the still-missing text.

test("embedTexts: a partial batch caches its successes so the retry embeds only the miss", async () => {
  const textOf = (opts) => JSON.parse(opts.body).content.parts[0].text;
  const requested = [];
  // Pass 1: text "alpha" succeeds, text "beta" 500s → embedTexts returns null.
  let betaOk = false;
  const restore = stubFetch(async (_url, opts) => {
    const text = textOf(opts);
    requested.push(text);
    if (text === "beta" && !betaOk) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ embedding: { values: [1, 2, 3] } }) };
  });
  try {
    const first = await embedTexts(["alpha", "beta"]);
    assert.equal(first, null, "incomplete batch still returns null to callers");
    assert.ok(requested.includes("alpha") && requested.includes("beta"), "both attempted");

    // Pass 2: alpha is now cached, so only beta is fetched — and it succeeds.
    betaOk = true;
    requested.length = 0;
    const second = await embedTexts(["alpha", "beta"]);
    assert.deepEqual(requested, ["beta"], "alpha served from cache; only the prior miss re-embedded");
    assert.ok(Array.isArray(second) && second.length === 2, "now complete → real vectors");
  } finally {
    restore();
  }
});
