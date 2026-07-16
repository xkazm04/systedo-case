/** Direction 2 — the Firestore-only tail closes. Proves the generic per-tenant
 *  document twin (table `tenant_docs`, migration v17) AND that the three
 *  non-campaign stores that hold REAL user state — keywords, patterns (saved
 *  library), social (posts + inbox) — read/write end-to-end through it under
 *  LOCAL_DB, so those surfaces no longer hard-500 when Firestore is unreachable.
 *  Runs the REAL store functions against the local backend.
 *
 *  Out of scope (documented): the patterns AUTO-mined library (getLibrary →
 *  extract.ts) reads the campaigns tree and may still 500 offline — this test drives
 *  the saved-pattern CRUD (listSavedPatterns / savePattern / deletePattern), not the
 *  auto-extraction. images/store is bucket-dependent (no twin) — covered by its own
 *  honest-offline degradation, asserted at the bottom. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-tenant-docs-${process.pid}.db`);
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

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { saveKeywordList, listKeywordLists, updateKeywordTags, deleteKeywordList } = await import(
  "@/lib/keywords/store"
);
const { listSavedPatterns, savePattern, deletePattern } = await import("@/lib/patterns/store");
const {
  createPost,
  listPosts,
  updatePost,
  deletePost,
  listDueScheduled,
  claimScheduledPost,
  listMessages,
  markReplied,
} = await import("@/lib/social/store");
const { IMAGE_LIBRARY_OFFLINE, listCreatives, getCreativeFile, deleteCreative, saveCreative } =
  await import("@/lib/images/store");

// --- the adapter primitives ----------------------------------------------------

test("adapter: set/get/merge/delete roundtrip", async () => {
  const s = await tenantDocs();
  assert.equal(await s.getDoc("t1", "c", "x"), undefined);
  await s.setDoc("t1", "c", "x", { a: 1, nested: { keep: true } });
  assert.deepEqual(await s.getDoc("t1", "c", "x"), { a: 1, nested: { keep: true } });
  // merge deep-merges nested maps, replaces scalars/arrays
  await s.setDoc("t1", "c", "x", { b: 2, nested: { add: 1 } }, { merge: true });
  assert.deepEqual(await s.getDoc("t1", "c", "x"), { a: 1, b: 2, nested: { keep: true, add: 1 } });
  // plain set overwrites the whole doc
  await s.setDoc("t1", "c", "x", { only: true });
  assert.deepEqual(await s.getDoc("t1", "c", "x"), { only: true });
  await s.deleteDoc("t1", "c", "x");
  assert.equal(await s.getDoc("t1", "c", "x"), undefined);
});

test("adapter: addDoc returns an id, listDocs orders + limits, queryEq filters", async () => {
  const s = await tenantDocs();
  const id1 = await s.addDoc("t2", "c", { createdAt: "2026-01-01", status: "a" });
  const id2 = await s.addDoc("t2", "c", { createdAt: "2026-03-01", status: "b" });
  await s.addDoc("t2", "c", { createdAt: "2026-02-01", status: "a" });
  assert.notEqual(id1, id2);
  const desc = await s.listDocs("t2", "c", { orderBy: { field: "createdAt", dir: "desc" } });
  assert.deepEqual(
    desc.map((d) => d.data.createdAt),
    ["2026-03-01", "2026-02-01", "2026-01-01"]
  );
  const capped = await s.listDocs("t2", "c", { orderBy: { field: "createdAt", dir: "asc" }, limit: 2 });
  assert.deepEqual(
    capped.map((d) => d.data.createdAt),
    ["2026-01-01", "2026-02-01"]
  );
  const onlyA = await s.queryEq("t2", "c", "status", "a");
  assert.equal(onlyA.length, 2);
  assert.ok(onlyA.every((d) => d.data.status === "a"));
});

test("adapter: batchSet + compareAndSet (atomic claim)", async () => {
  const s = await tenantDocs();
  await s.batchSet("t3", "c", [
    { id: "m0", data: { status: "scheduled", n: 0 } },
    { id: "m1", data: { status: "scheduled", n: 1 } },
  ]);
  assert.equal((await s.listDocs("t3", "c")).length, 2);
  // first claim wins, flips status; second claim on the now-publishing doc fails
  assert.equal(await s.compareAndSet("t3", "c", "m0", { field: "status", equals: "scheduled" }, { status: "publishing" }), true);
  assert.equal((await s.getDoc("t3", "c", "m0")).status, "publishing");
  assert.equal(await s.compareAndSet("t3", "c", "m0", { field: "status", equals: "scheduled" }, { status: "publishing" }), false);
  // missing doc → false
  assert.equal(await s.compareAndSet("t3", "c", "nope", { field: "status", equals: "scheduled" }, { status: "x" }), false);
});

// --- keywords store ------------------------------------------------------------

test("keywords: save → list (newest first) → retag → delete", async () => {
  const T = "kw-tenant";
  const a = await saveKeywordList(T, {
    name: "List A",
    seed: "ořechy",
    source: "sample",
    keywords: [
      { keyword: "kešu", intent: "transactional", opportunity: 80, avgMonthlySearches: 1000, competition: "low", tag: "core" },
      { keyword: "levné ořechy", intent: "transactional", opportunity: 60, avgMonthlySearches: 500, competition: "high", tag: "watch" },
    ],
  });
  assert.ok(a.id);
  assert.equal(a.createdAt, a.updatedAt);
  await new Promise((r) => setTimeout(r, 2));
  const b = await saveKeywordList(T, { name: "List B", seed: "semínka", source: "sample", keywords: [] });

  const lists = await listKeywordLists(T);
  assert.deepEqual(lists.map((l) => l.name), ["List B", "List A"]); // newest first
  assert.equal(lists.find((l) => l.id === a.id).keywords.length, 2);

  await updateKeywordTags(T, a.id, { "levné ořechy": "negative" });
  const retagged = (await listKeywordLists(T)).find((l) => l.id === a.id);
  assert.equal(retagged.keywords.find((k) => k.keyword === "levné ořechy").tag, "negative");
  assert.equal(retagged.keywords.find((k) => k.keyword === "kešu").tag, "core"); // untouched

  await deleteKeywordList(T, b.id);
  assert.deepEqual((await listKeywordLists(T)).map((l) => l.id), [a.id]);
});

// --- patterns store (saved library) --------------------------------------------

test("patterns: save (validated) → list (newest first) → delete", async () => {
  const T = "pat-tenant";
  const p1 = await savePattern(T, {
    title: "Scale winners hard",
    category: "budget",
    insight: "Move budget to the campaigns beating target.",
    evidence: "PNO 0.12 vs 0.18 goal.",
  });
  assert.equal(p1.source, "manual");
  assert.equal(p1.category, "budget");
  // an invalid category falls back to "structure" (isPatternCategory guard)
  const p2 = await savePattern(T, { title: "T2", category: "nonsense", insight: "x" });
  assert.equal(p2.category, "structure");

  const listed = await listSavedPatterns(T);
  assert.equal(listed.length, 2);
  assert.equal(listed[0].id, p2.id); // newest first (createdAt desc)

  assert.equal(await deletePattern(T, p1.id), true);
  assert.equal(await deletePattern(T, p1.id), false); // already gone
  assert.deepEqual((await listSavedPatterns(T)).map((p) => p.id), [p2.id]);
});

// --- social store (posts + inbox) ----------------------------------------------

test("social: create/list/update/delete posts", async () => {
  const T = "soc-tenant";
  const draft = await createPost(T, { platform: "instagram", content: "Hello", status: "draft" });
  await new Promise((r) => setTimeout(r, 2));
  await createPost(T, { platform: "facebook", content: "World", status: "published", publishedAt: "2026-07-01T10:00:00Z" });

  const posts = await listPosts(T);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].platform, "facebook"); // newest first

  await updatePost(T, draft.id, { status: "failed", error: "boom" });
  const updated = (await listPosts(T)).find((p) => p.id === draft.id);
  assert.equal(updated.status, "failed");
  assert.equal(updated.content, "Hello"); // merge kept content

  assert.equal(await deletePost(T, draft.id), true);
  assert.equal(await deletePost(T, draft.id), false);
  assert.equal((await listPosts(T)).length, 1);
});

test("social: listDueScheduled + atomic claim (publish cron path)", async () => {
  const T = "soc-due";
  const due = await createPost(T, { platform: "linkedin", content: "due", status: "scheduled", scheduledAt: "2026-07-01T00:00:00Z" });
  await createPost(T, { platform: "linkedin", content: "future", status: "scheduled", scheduledAt: "2027-01-01T00:00:00Z" });
  // a malformed scheduled post with no scheduledAt must NOT be due
  await createPost(T, { platform: "linkedin", content: "malformed", status: "scheduled" });

  const dueList = await listDueScheduled(T, "2026-08-01T00:00:00Z");
  assert.deepEqual(dueList.map((p) => p.content), ["due"]);

  assert.equal(await claimScheduledPost(T, due.id), true);
  assert.equal(await claimScheduledPost(T, due.id), false); // already claimed
  assert.equal((await listPosts(T)).find((p) => p.id === due.id).status, "publishing");
});

test("social: inbox seeds sample messages on first read, markReplied persists", async () => {
  const T = "soc-inbox";
  const first = await listMessages(T);
  assert.equal(first.length, 4); // seeded
  assert.deepEqual([...first].map((m) => m.receivedAt).sort().reverse(), first.map((m) => m.receivedAt)); // newest first
  // reading again does not re-seed (still 4)
  assert.equal((await listMessages(T)).length, 4);

  const target = first[0];
  assert.equal(await markReplied(T, target.id, "Díky!"), true);
  const after = (await listMessages(T)).find((m) => m.id === target.id);
  assert.equal(after.status, "replied");
  assert.equal(after.reply, "Díky!");
  assert.equal(await markReplied(T, "missing", "x"), false);
});

// --- images store: bucket-dependent, honest offline degradation (no twin) -------

test("images: library degrades honestly offline (no 500, no local blob store)", async () => {
  assert.equal(IMAGE_LIBRARY_OFFLINE, true); // LOCAL_DB is on in this suite
  assert.deepEqual(await listCreatives("img-tenant"), []); // empty, not a throw
  assert.equal(await getCreativeFile("img-tenant", "any"), null); // stream route → 404
  assert.equal(await deleteCreative("img-tenant", "any"), false);
  // save refuses honestly (the POST route treats this as non-fatal → unsaved)
  await assert.rejects(
    saveCreative("img-tenant", { buffer: Buffer.from(""), mime: "image/png", prompt: "p", style: "s", format: "square", score: null, defects: "" }),
    /offline mode/
  );
});
