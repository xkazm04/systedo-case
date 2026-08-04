/** project_state stops losing concurrent writes.
 *
 *  `project_state` is the catch-all carrier for several features' state, and every
 *  read-modify-write caller used to do read → merge in JS → whole-blob write with no
 *  transaction and no compare-and-swap. Two near-simultaneous generations on one
 *  project silently dropped one another: whichever save landed last won, with no
 *  error and no trace. THE test here is "two interleaved writers BOTH survive".
 *
 *  Also pinned: the key registry (a colliding key is a compile error, and the route
 *  whitelist is derived from it), the version stamp on the stored envelope, and the
 *  documented read path for the legacy unversioned blobs already in the installed
 *  base. Runs against the REAL sqlite backend on a throwaway db file — the Firestore
 *  side of the same contract is in distribution-variants-firestore.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-project-state-cas-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const {
  getProjectState,
  saveProjectState,
  readProjectState,
  saveProjectStateIfUnchanged,
  mutateProjectState,
  ProjectStateConflictError,
} = await import("@/lib/project-state/store");
const { PROJECT_STATE_KEYS, isProjectStateKey, isHttpProjectStateKey } = await import(
  "@/lib/project-state/keys"
);
const { encodeProjectState, decodeProjectState } = await import("@/lib/project-state/envelope");
const { getDb } = await import("@/lib/db");
const { recordAdCopy, getAdCopy } = await import("@/lib/catalog/ad-copy-store");
const { recordVariant, recordSource, getVariants } = await import(
  "@/lib/distribution/variants-store"
);
const { recordContentEntry, deleteContentEntry, getContentLibrary } = await import(
  "@/lib/content-library/store"
);
const { adCopyBySku } = await import("@/lib/catalog/ad-copy");
const { articleKey, variantsForArticle, storedSources } = await import(
  "@/lib/distribution/variants"
);

const U = "u-cas";
const entry = (sku) => ({
  sku,
  result: { headlines: [`H ${sku}`], descriptions: [`D ${sku}`] },
  generatedAt: "2026-08-03T10:00:00.000Z",
  model: "test",
  demo: false,
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test("every key a store writes is declared in the central registry", () => {
  for (const key of [
    "content-schedule",
    "reviews",
    "adCopy",
    "distributionVariants",
    "contentLibrary",
  ]) {
    assert.ok(isProjectStateKey(key), `${key} must be registered`);
    assert.equal(typeof PROJECT_STATE_KEYS[key].owner, "string");
    assert.ok(PROJECT_STATE_KEYS[key].version >= 1, "a registered key carries a schema version");
  }
});

test("the route whitelist is derived from the registry, not a second list", () => {
  // Client-drivable state, exactly the two the state route used to hard-code…
  assert.ok(isHttpProjectStateKey("content-schedule"));
  assert.ok(isHttpProjectStateKey("reviews"));
  // …and the server-owned blobs stay closed to a browser PUT.
  assert.equal(isHttpProjectStateKey("adCopy"), false);
  assert.equal(isHttpProjectStateKey("distributionVariants"), false);
  assert.equal(isHttpProjectStateKey("contentLibrary"), false);
  assert.equal(isHttpProjectStateKey("nope"), false);
});

// ---------------------------------------------------------------------------
// The version stamp + the legacy read path
// ---------------------------------------------------------------------------

test("a write is version-stamped in the stored bytes", async () => {
  const P = "p-stamp";
  await saveProjectState(U, P, "reviews", { answered: ["r1"] });
  const row = getDb()
    .prepare("SELECT data FROM project_state WHERE user_id=? AND project_id=? AND key=?")
    .get(U, P, "reviews");
  const stored = JSON.parse(row.data);
  assert.equal(stored.__projectState, 1, "the envelope marker is present");
  assert.equal(stored.v, PROJECT_STATE_KEYS.reviews.version, "the key's schema version is stamped");
  assert.deepEqual(stored.data, { answered: ["r1"] }, "the payload rides inside the envelope");
  // …and the caller still sees only its payload.
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["r1"] });
});

test("a LEGACY unversioned blob still reads back, reported at version 0", async () => {
  const P = "p-legacy";
  // Exactly what the installed base holds: the raw payload, no envelope.
  getDb()
    .prepare(
      `INSERT INTO project_state (user_id, project_id, key, data, updated_at) VALUES (?,?,?,?,?)`
    )
    .run(U, P, "content-schedule", JSON.stringify([{ id: "post-0", status: "scheduled" }]), "x");

  assert.deepEqual(await getProjectState(U, P, "content-schedule"), [
    { id: "post-0", status: "scheduled" },
  ]);
  const read = await readProjectState(U, P, "content-schedule");
  assert.equal(read.version, 0, "a pre-envelope blob is reported as version 0");
  assert.ok(read.revision, "a legacy blob still yields a CAS token");

  // A write through the new path re-stamps it in place — no backfill needed.
  await saveProjectState(U, P, "content-schedule", [{ id: "post-0", status: "published" }]);
  assert.equal((await readProjectState(U, P, "content-schedule")).version, 1);
});

test("the envelope round-trips and legacy detection is pure", () => {
  const raw = encodeProjectState({ a: 1 }, 3, "2026-08-03T00:00:00.000Z");
  assert.deepEqual(decodeProjectState(raw), { data: { a: 1 }, version: 3, legacy: false });
  assert.deepEqual(decodeProjectState(JSON.stringify([1, 2])), {
    data: [1, 2],
    version: 0,
    legacy: true,
  });
  assert.throws(() => decodeProjectState("{not json"));
});

// ---------------------------------------------------------------------------
// Compare-and-swap
// ---------------------------------------------------------------------------

test("a CAS write against a stale revision throws a RETRYABLE conflict", async () => {
  const P = "p-cas";
  await saveProjectState(U, P, "reviews", { answered: ["r1"] });
  const stale = (await readProjectState(U, P, "reviews")).revision;

  // Someone else writes in between.
  await saveProjectState(U, P, "reviews", { answered: ["r1", "r2"] });

  await assert.rejects(
    () => saveProjectStateIfUnchanged(U, P, "reviews", { answered: ["mine"] }, stale),
    (err) => err instanceof ProjectStateConflictError && err.retryable === true
  );
  // The loser did NOT overwrite the winner.
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["r1", "r2"] });

  // With the CURRENT revision the same write lands.
  const fresh = (await readProjectState(U, P, "reviews")).revision;
  await saveProjectStateIfUnchanged(U, P, "reviews", { answered: ["mine"] }, fresh);
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["mine"] });
});

test("a create-only CAS (expected null) loses to an existing blob", async () => {
  const P = "p-create";
  await saveProjectStateIfUnchanged(U, P, "reviews", { answered: ["first"] }, null);
  await assert.rejects(
    () => saveProjectStateIfUnchanged(U, P, "reviews", { answered: ["second"] }, null),
    (err) => err instanceof ProjectStateConflictError
  );
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["first"] });
});

test("mutateProjectState is one read + one write when uncontended", async () => {
  const P = "p-uncontended";
  const out = await mutateProjectState(U, P, "reviews", (cur) => ({
    answered: [...(cur?.answered ?? []), "r1"],
  }));
  assert.deepEqual(out, { answered: ["r1"] });
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: ["r1"] });
});

// ---------------------------------------------------------------------------
// THE regression: two interleaved writers both survive
// ---------------------------------------------------------------------------

test("two interleaved ad-copy generations BOTH land (neither is silently dropped)", async () => {
  const P = "p-adcopy-race";
  await Promise.all([recordAdCopy(U, P, entry("SKU-A")), recordAdCopy(U, P, entry("SKU-B"))]);
  const bySku = adCopyBySku(await getAdCopy(U, P));
  assert.ok(bySku["SKU-A"], "SKU-A survived");
  assert.ok(bySku["SKU-B"], "SKU-B survived");
});

test("many interleaved writers all land", async () => {
  const P = "p-adcopy-many";
  const skus = ["S1", "S2", "S3", "S4", "S5"];
  await Promise.all(skus.map((s) => recordAdCopy(U, P, entry(s))));
  const bySku = adCopyBySku(await getAdCopy(U, P));
  assert.deepEqual(
    Object.keys(bySku).sort(),
    [...skus].sort(),
    "every concurrent generation is present in the final blob"
  );
});

test("two interleaved distribution writers BOTH land, across the SAME blob", async () => {
  const P = "p-variants-race";
  const A = { title: "Jak na distribuci", url: "https://blog.example.cz/a" };
  const K = articleKey(A);
  const v = (channel, text) => ({ channel, text, status: "edited", updatedAt: "2026-08-03T10:00:00.000Z" });

  // A variant write and a SOURCE write race on the same key — the worst case, since
  // the handoff record and the channel variants share one blob.
  await Promise.all([
    recordVariant(U, P, K, A.title, v("LinkedIn", "li")),
    recordVariant(U, P, K, A.title, v("Instagram", "ig")),
    recordSource(U, P, { articleKey: K, title: A.title, url: A.url, body: "text", savedAt: "2026-08-03T10:00:00.000Z" }),
  ]);

  const state = await getVariants(U, P);
  const stored = variantsForArticle(state, K);
  assert.deepEqual(Object.keys(stored).sort(), ["Instagram", "LinkedIn"]);
  assert.equal(stored.LinkedIn.text, "li");
  assert.equal(stored.Instagram.text, "ig");
  assert.equal(storedSources(state).length, 1, "the handoff source survived the variant writes");
});

test("two content-library saves in quick succession BOTH survive", async () => {
  const P = "p-library-race";
  const piece = (id) => ({
    id,
    kind: "brief",
    title: `Brief ${id}`,
    slug: id,
    savedAt: "2026-08-04T10:00:00.000Z",
    form: {},
    brief: {},
    briefMeta: {},
  });
  await Promise.all([
    recordContentEntry(U, P, piece("one")),
    recordContentEntry(U, P, piece("two")),
    recordContentEntry(U, P, piece("three")),
  ]);
  const ids = (await getContentLibrary(U, P)).entries.map((e) => e.id).sort();
  assert.deepEqual(ids, ["one", "three", "two"], "no save was silently dropped");

  // A delete racing a save must not resurrect or lose either.
  await Promise.all([deleteContentEntry(U, P, "one"), recordContentEntry(U, P, piece("four"))]);
  const after = (await getContentLibrary(U, P)).entries.map((e) => e.id).sort();
  assert.deepEqual(after, ["four", "three", "two"]);
});

test("a corrupt blob is repaired under CAS rather than blind-clobbered", async () => {
  const P = "p-corrupt";
  getDb()
    .prepare(
      `INSERT INTO project_state (user_id, project_id, key, data, updated_at) VALUES (?,?,?,?,?)`
    )
    .run(U, P, "reviews", "{not valid json", "x");

  const origErr = console.error;
  let logged = false;
  console.error = () => {
    logged = true;
  };
  try {
    const read = await readProjectState(U, P, "reviews");
    assert.equal(read.data, null, "unreadable bytes still degrade to null");
    assert.equal(read.revision, "{not valid json", "…but the CAS token is the corrupt bytes");
    await saveProjectStateIfUnchanged(U, P, "reviews", { answered: [] }, read.revision);
  } finally {
    console.error = origErr;
  }
  assert.ok(logged, "the corrupt blob is logged, not silently swallowed");
  assert.deepEqual(await getProjectState(U, P, "reviews"), { answered: [] });
});
