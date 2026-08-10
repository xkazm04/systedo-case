/** The same tenant activity feed on the OTHER backend: LOCAL_DB off, so the
 *  dispatcher in src/lib/campaigns/activity.ts resolves to activity.firestore.ts,
 *  with `@/lib/firebase` redirected to an in-memory query-capable fake
 *  (./activity-firestore-fake.mjs).
 *
 *  Worth its own file: "works on both backends" is a claim, and the two backends are
 *  genuinely different code (a Firestore sub-collection with a server-side
 *  where/orderBy/limit vs. a sqlite JSON scan with an in-memory window). Without
 *  this, a Firestore-only regression would ship green — and this file is also where
 *  the `ok:false` OUTAGE half of the contract is proven, which the local twin
 *  cannot express. Mirrors content-library-firestore.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Swap `@/lib/firebase` for the fake BEFORE anything imports the store.
register("./activity-firestore-fake-hook.mjs", import.meta.url);

// LOCAL_DB deliberately unset → the dispatcher picks the Firestore backend.
delete process.env.LOCAL_DB;

const { firestoreDump, resetFirestore, setFirestoreAvailable } = await import(
  "./activity-firestore-fake.mjs"
);
const { recordActivity, listActivity, listActivitySince } = await import("@/lib/campaigns/activity");

const T = "u_user-act_proj_p1";
const PATH = `tenants/${T}/activity`;

test("[firestore] a fresh tenant reads as GENUINELY empty, not as an outage", async () => {
  resetFirestore();
  assert.deepEqual(await listActivity(T), { records: [], ok: true });
});

test("[firestore] a recorded entry lands under tenants/{tenant}/activity", async () => {
  resetFirestore();
  await recordActivity(T, { kind: "pause", title: "Kampaň pozastavena", detail: "Search · Brand" });
  const rows = firestoreDump(PATH);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].data.title, "Kampaň pozastavena");
  assert.ok(Date.parse(rows[0].data.at) > 0);
});

test("[firestore] the publish taxonomy (incl. the simulated tag) survives the roundtrip", async () => {
  resetFirestore();
  await recordActivity(T, {
    kind: "update",
    title: "Příspěvek publikován",
    detail: "LinkedIn",
    module: "obsah-plan",
    publishKind: "social_post",
    publishVia: "channel",
    publishSimulated: true,
  });
  const [row] = (await listActivity(T)).records;
  assert.equal(row.publishKind, "social_post");
  assert.equal(row.publishVia, "channel");
  assert.equal(row.publishSimulated, true);
});

test("[firestore] the feed is newest-first and honours the limit", async () => {
  resetFirestore();
  for (const n of ["one", "two", "three"]) {
    await recordActivity(T, { kind: "sync", title: n, detail: "" });
  }
  assert.deepEqual(
    (await listActivity(T)).records.map((r) => r.title),
    ["three", "two", "one"]
  );
  assert.equal((await listActivity(T, 2)).records.length, 2);
});

test("[firestore] listActivitySince windows the feed", async () => {
  resetFirestore();
  await recordActivity(T, { kind: "alert", title: "Upozornění", detail: "" });
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal((await listActivitySince(T, past)).records.length, 1);
  const empty = await listActivitySince(T, future);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.records, []);
});

test("[firestore] a READ FAILURE is ok:false — an outage is never dressed as emptiness", async () => {
  resetFirestore();
  await recordActivity(T, { kind: "sync", title: "Synchronizace", detail: "" });
  setFirestoreAvailable(false);
  assert.deepEqual(await listActivity(T), { records: [], ok: false });
  assert.deepEqual(await listActivitySince(T, "2020-01-01T00:00:00.000Z"), { records: [], ok: false });
});

test("[firestore] a write failure never throws into the caller", async () => {
  resetFirestore();
  setFirestoreAvailable(false);
  await recordActivity(T, { kind: "sync", title: "Synchronizace", detail: "" });
  setFirestoreAvailable(true);
  assert.deepEqual((await listActivity(T)).records, []);
});
