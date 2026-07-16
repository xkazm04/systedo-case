/** Direction 2 — the /api/ai response cache survives deploys: the two-tier cache
 *  (process-local L1 + durable L2). Proves the pure key policy (hashAiInput bucketing),
 *  and the L2 durable tier through its LOCAL node:sqlite backend (table
 *  `ai_response_cache`, DDL + migration v15 in src/lib/db.ts): a roundtrip, TTL expiry
 *  (expired entries are never served + are purged on read), the per-tool oldest-first
 *  eviction cap, the oversize-payload skip, and — the whole point of L2 — that a durable
 *  hit is PROMOTED into L1 so the next same-instance read is L1-fast. The Firestore
 *  backend mirrors this exact dispatcher shape (see twin_archive / cron_runs), so proving
 *  the LOCAL store + the shared pure partition covers both backends. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-response-cache-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

let hashAiInput, getCachedAi, getCachedAiDurable, setCachedAiDurable;
let readDurable, writeDurable, L2_MAX_PER_TOOL;
let getDb;

/** A minimal, real-shaped AiResponse — a non-demo result the cache is allowed to keep. */
function resp(text = "ok", over = {}) {
  return {
    result: { reply: text },
    meta: { model: "test", demo: false, prompt: "p", tookMs: 1, ...over },
  };
}

before(async () => {
  const [cache, store, db] = await Promise.all([
    import("@/lib/ai/response-cache"),
    import("@/lib/ai/response-cache-store"),
    import("@/lib/db"),
  ]);
  hashAiInput = cache.hashAiInput;
  getCachedAi = cache.getCachedAi;
  getCachedAiDurable = cache.getCachedAiDurable;
  setCachedAiDurable = cache.setCachedAiDurable;
  readDurable = store.readDurable;
  writeDurable = store.writeDurable;
  L2_MAX_PER_TOOL = store.L2_MAX_PER_TOOL;
  getDb = db.getDb;
});

// --- pure: the key policy buckets identical inputs together, distinct ones apart ----

test("hashAiInput is stable for identical inputs and splits by mode/locale/provider/value", () => {
  const v = { topic: "ořechy", n: 3 };
  const base = hashAiInput("ads", "cs", v);
  assert.equal(base, hashAiInput("ads", "cs", { topic: "ořechy", n: 3 }), "same input → same key");
  assert.notEqual(base, hashAiInput("brief", "cs", v), "different mode → different bucket");
  assert.notEqual(base, hashAiInput("ads", "en", v), "different locale → different bucket");
  assert.notEqual(base, hashAiInput("ads", "cs", v, "byom:openai::"), "provider tag splits buckets");
  assert.notEqual(base, hashAiInput("ads", "cs", { topic: "ořechy", n: 4 }), "different value → different key");
});

// --- L2 local backend: roundtrip -----------------------------------------------------

test("L2 roundtrip: a written entry reads back with its value + expiry", async () => {
  const key = hashAiInput("ads", "cs", { case: "roundtrip" });
  const expires = Date.now() + 60_000;
  await writeDurable("ads", key, { value: resp("durable"), expires });
  const hit = await readDurable(key);
  assert.ok(hit, "the entry is durably present");
  assert.equal(hit.value.result.reply, "durable");
  assert.equal(hit.expires, expires);
});

// --- L2 local backend: TTL expiry ----------------------------------------------------

test("L2 never serves an expired entry, and purges it on read", async () => {
  const key = hashAiInput("brief", "cs", { case: "ttl" });
  await writeDurable("brief", key, { value: resp("stale"), expires: Date.now() - 1 });
  assert.equal(await readDurable(key), null, "expired → miss");
  // And it was purged: a direct row lookup finds nothing.
  const row = getDb().prepare("SELECT cache_key FROM ai_response_cache WHERE cache_key = ?").get(key);
  assert.equal(row, undefined, "the expired row was deleted on read");
});

// --- L2 local backend: per-tool eviction cap ----------------------------------------

test("L2 evicts the OLDEST entries past the per-tool cap on write", async () => {
  const tool = "evict-tool";
  getDb().prepare("DELETE FROM ai_response_cache WHERE tool = ?").run(tool);
  const expires = Date.now() + 60_000;
  // Write cap+2 distinct keys with strictly increasing created_at (a tiny stagger via
  // the loop order; created_at is Date.now() at write, and sqlite ties break on key).
  const keys = [];
  for (let i = 0; i < L2_MAX_PER_TOOL + 2; i++) {
    const key = hashAiInput(tool, "cs", { i });
    keys.push(key);
    // Force a deterministic created_at ordering so "oldest" is unambiguous.
    getDb()
      .prepare(
        `INSERT INTO ai_response_cache (cache_key, tool, data, expires, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(key, tool, JSON.stringify(resp(`e${i}`)), expires, 1000 + i);
  }
  // One more via the real write path → triggers eviction down to the cap.
  const last = hashAiInput(tool, "cs", { i: "last" });
  keys.push(last);
  await writeDurable(tool, last, { value: resp("last"), expires });

  const count = getDb()
    .prepare("SELECT COUNT(*) AS n FROM ai_response_cache WHERE tool = ?")
    .get(tool).n;
  assert.equal(count, L2_MAX_PER_TOOL, "held at the per-tool cap");
  // The three oldest (created_at 1000,1001,1002) were evicted; a recent one survives.
  assert.equal(await readDurable(keys[0]), null, "oldest evicted");
  assert.equal(await readDurable(keys[1]), null, "second-oldest evicted");
  assert.ok(await readDurable(last), "the newest survives");
});

// --- setCachedAiDurable guards: demo + oversize are never written --------------------

test("setCachedAiDurable skips a demo result (never durably cached)", async () => {
  const key = hashAiInput("ads", "cs", { case: "demo" });
  setCachedAiDurable("ads", key, resp("canned", { demo: true }));
  assert.equal(await readDurable(key), null, "a demo/no-provider result is never written to L2");
});

test("setCachedAiDurable skips an oversized payload (documented ~100KB threshold)", async () => {
  const key = hashAiInput("ads", "cs", { case: "oversize" });
  const huge = resp("x".repeat(200_000)); // serialized well over the 100KB L2 cap
  setCachedAiDurable("ads", key, huge);
  assert.equal(await readDurable(key), null, "an oversized result is never written to L2");
});

// --- L1-from-L2 promotion (the cross-instance payoff) --------------------------------

test("getCachedAiDurable promotes an L2 hit into L1 (next same-instance read is L1-fast)", async () => {
  const key = hashAiInput("analysis", "cs", { case: "promote" });
  // Simulate a value another instance cached durably; this instance's L1 is cold.
  assert.equal(getCachedAi(key), null, "L1 is cold for this key");
  await writeDurable("analysis", key, { value: resp("from-L2"), expires: Date.now() + 60_000 });

  const durable = await getCachedAiDurable(key);
  assert.ok(durable, "L2 serves the hit");
  assert.equal(durable.result.reply, "from-L2");
  // Promotion: the synchronous L1 getter now returns it without any store round-trip.
  const l1 = getCachedAi(key);
  assert.ok(l1, "the durable hit was promoted into L1");
  assert.equal(l1.result.reply, "from-L2");
});

test("getCachedAiDurable does not promote (nor serve) an expired L2 entry", async () => {
  const key = hashAiInput("analysis", "cs", { case: "promote-expired" });
  await writeDurable("analysis", key, { value: resp("old"), expires: Date.now() - 1 });
  assert.equal(await getCachedAiDurable(key), null, "expired → miss");
  assert.equal(getCachedAi(key), null, "and nothing promoted into L1");
});
