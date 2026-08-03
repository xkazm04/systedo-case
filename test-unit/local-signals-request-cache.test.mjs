/** Request-scoped dedupe of the local-signals read (`signalsForRequest` in
 *  src/lib/local-signals/resolve.ts): the four resolvers that back one /lokalni load
 *  (ladder + reviews + locations + coverage) must share ONE store read per project per
 *  request, and must NOT cache across requests.
 *
 *  How the read count is proven without a mock: React's `cache()` only memoizes inside a
 *  request scope, so the test installs a minimal cache dispatcher (exactly what the
 *  server renderer installs per request) and then MUTATES the sqlite store mid-scope. A
 *  resolver that re-reads would see the mutation; every resolver seeing the pre-mutation
 *  blob is proof that only the first call reached the store. A second scope seeing the
 *  new blob proves the memoization is request-scoped, not a TTL. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-local-signals-request-cache-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const React = await import("react");
const { saveLocalSignals, clearLocalSignals } = await import("@/lib/local-signals/store");
const { resolveLocalLadder, resolveReviews, resolveLocations, resolveCoverage } = await import(
  "@/lib/local-signals/resolve"
);

const internals = React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Run `fn` inside a fresh request-style cache scope (one per simulated request). */
async function withRequestScope(fn) {
  const store = new Map();
  const prev = internals.A;
  internals.A = {
    getCacheForType(create) {
      if (!store.has(create)) store.set(create, create());
      return store.get(create);
    },
  };
  try {
    return await fn();
  } finally {
    internals.A = prev;
  }
}

const meta = (rowCount) => ({ source: "import", syncedAt: "2026-07-01T00:00:00.000Z", rowCount });

const blob = (tag) => ({
  meta: meta(1),
  ladder: [
    {
      id: `kw|${tag}`,
      keyword: `zubař ${tag}`,
      area: "Praha",
      history: [{ rank: 3, at: "2026-07-01" }],
      current: 3,
      best: 3,
    },
  ],
  reviews: {
    meta: meta(1),
    items: [{ id: `r-${tag}`, author: tag, area: "Praha", rating: 5, text: `t-${tag}`, at: "2026-07-01" }],
  },
  gbp: {
    meta: meta(1),
    rows: [{ name: `Pobočka ${tag}`, status: "connected", reviews: 10, rating: 4.5, unanswered: 0 }],
  },
  coverage: {
    meta: meta(1),
    rows: [{ service: `Sluzba ${tag}`, locality: "Praha", hasPage: true }],
  },
});

const seedTarget = { id: "t1", service: "Sluzba A", area: "Praha", hasPage: false, rank: 7 };
const sampleLocation = { id: "l1", name: "Pobočka A", status: "connected", reviews: 1, rating: 4, unanswered: 0 };

async function resolveAll(projectId) {
  const [ladder, reviews, locations, coverage] = await Promise.all([
    resolveLocalLadder(projectId, []),
    resolveReviews(projectId, []),
    resolveLocations(projectId, [sampleLocation]),
    resolveCoverage(projectId, [seedTarget]),
  ]);
  return { ladder, reviews, locations, coverage };
}

test("one read per project per request: all four resolvers share the first read", async () => {
  const pid = "proj-cache-1";
  await saveLocalSignals(pid, blob("A"));

  const seen = await withRequestScope(async () => {
    // First resolver primes the request-scoped read.
    const first = await resolveLocalLadder(pid, []);
    assert.equal(first.ladder[0].keyword, "zubař A");
    // Mutate the store MID-REQUEST. A resolver that re-reads would observe "B".
    await saveLocalSignals(pid, blob("B"));
    return resolveAll(pid);
  });

  assert.equal(seen.ladder.ladder[0].keyword, "zubař A");
  assert.equal(seen.reviews.reviews[0].author, "A");
  assert.ok(seen.locations.rows.some((r) => r.name === "Pobočka A"));
  assert.ok(seen.coverage.targets.length > 0);
  // Every resolver is still live-labelled — dedupe must not change the verdict.
  assert.equal(seen.ladder.live, true);
  assert.equal(seen.reviews.live, true);
  assert.equal(seen.locations.live, true);
  assert.equal(seen.coverage.live, true);
});

test("the memo is request-scoped: a new request sees the newer blob (no TTL, no cross-request cache)", async () => {
  const pid = "proj-cache-1"; // left holding blob("B") by the previous test
  const seen = await withRequestScope(() => resolveAll(pid));
  assert.equal(seen.ladder.ladder[0].keyword, "zubař B");
  assert.equal(seen.reviews.reviews[0].author, "B");
});

test("the memo is keyed per project: two projects in one request do not share a blob", async () => {
  await saveLocalSignals("proj-cache-x", blob("X"));
  await saveLocalSignals("proj-cache-y", blob("Y"));
  const [x, y] = await withRequestScope(() =>
    Promise.all([resolveLocalLadder("proj-cache-x", []), resolveLocalLadder("proj-cache-y", [])])
  );
  assert.equal(x.ladder[0].keyword, "zubař X");
  assert.equal(y.ladder[0].keyword, "zubař Y");
});

test("resolved values are unchanged: a project with no signals falls back to sample identically", async () => {
  const pid = "proj-cache-empty";
  await clearLocalSignals(pid);
  const sampleLadder = [{ id: "s1", keyword: "s", area: "Praha", history: [], current: 4, best: 4 }];

  const inScope = await withRequestScope(async () => {
    const ladder = await resolveLocalLadder(pid, sampleLadder);
    const coverage = await resolveCoverage(pid, [seedTarget]);
    const locations = await resolveLocations(pid, [sampleLocation]);
    return { ladder, coverage, locations };
  });
  // Outside any request scope React's cache is a pass-through — same answers either way.
  const outOfScope = await resolveLocalLadder(pid, sampleLadder);

  assert.equal(inScope.ladder.live, false);
  assert.equal(inScope.ladder.source, "sample");
  assert.equal(inScope.ladder.ladder, sampleLadder); // same reference, byte-identical fallback
  assert.equal(inScope.coverage.targets[0].rank, 7); // seeded rank intact when not live
  assert.equal(inScope.locations.rows[0], sampleLocation);
  assert.deepEqual(outOfScope, inScope.ladder);
});
