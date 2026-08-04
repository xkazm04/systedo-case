/** The same saved-content-library store on the OTHER backend: LOCAL_DB off, so the
 *  project_state dispatcher resolves to src/lib/project-state/store.firestore.ts,
 *  with `@/lib/firebase` redirected to an in-memory fake (./firestore-fake.mjs).
 *
 *  Worth its own file: "works on both backends" is a claim, and the two backends are
 *  genuinely different code (doc-id composition + a JSON string field vs. a sqlite
 *  upsert). Without this, a Firestore-only regression would ship green. Mirrors
 *  distribution-variants-firestore.test.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Swap `@/lib/firebase` for the fake BEFORE anything imports the store.
register("./firestore-fake-hook.mjs", import.meta.url);

// LOCAL_DB deliberately unset → the dispatcher picks the Firestore backend.
delete process.env.LOCAL_DB;

const { firestoreDump, resetFirestore } = await import("./firestore-fake.mjs");
const { libraryEntries, sanitizeEntry } = await import("@/lib/content-library/entries");
const { getContentLibrary, recordContentEntry, deleteContentEntry } = await import(
  "@/lib/content-library/store"
);

const NOW = new Date("2026-08-04T09:00:00.000Z");
const U = "u-lib-fs";
const P = "p-lib-fs";

const brief = (slug) => ({
  titleTag: "Jak skladovat ořechy",
  metaDescription: "Návod.",
  h1: "Jak skladovat ořechy",
  slug,
  outline: [{ heading: "Proč žluknou", points: ["oxidace"] }],
  faq: [],
  keywords: ["skladování"],
  internalLinks: [],
  rationale: "",
});
const form = (topic) => ({ topic, primaryKeyword: "skladování", audience: "Kupující", contentType: "blog" });
const meta = { model: "gemini-2.5-flash", demo: false, tookMs: 1200 };
const entry = (slug, topic) => sanitizeEntry({ form: form(topic), brief: brief(slug), briefMeta: meta }, NOW);

test("[firestore] an unsaved project reads back null", async () => {
  resetFirestore();
  assert.equal(await getContentLibrary(U, P), null);
});

test("[firestore] a saved brief survives the roundtrip", async () => {
  resetFirestore();
  await recordContentEntry(U, P, entry("skladovani", "Ořechy"));
  const entries = libraryEntries(await getContentLibrary(U, P));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].brief.slug, "skladovani");
  assert.equal(entries[0].form.topic, "Ořechy");
});

test("[firestore] the blob lands under the per-(user, project, key) doc id", async () => {
  resetFirestore();
  await recordContentEntry(U, P, entry("skladovani", "Ořechy"));
  assert.deepEqual([...firestoreDump().keys()], [`users/${U}/projectState/${P}__contentLibrary`]);
});

test("[firestore] a second save joins the same doc, newest first — no fan-out", async () => {
  resetFirestore();
  await recordContentEntry(U, P, entry("prvni", "První"));
  await recordContentEntry(U, P, entry("druhy", "Druhé"));
  const entries = libraryEntries(await getContentLibrary(U, P));
  assert.deepEqual(
    entries.map((e) => e.brief.slug),
    ["druhy", "prvni"]
  );
  assert.equal(firestoreDump().size, 1);
});

test("[firestore] a delete removes exactly the requested entry", async () => {
  resetFirestore();
  const first = entry("prvni", "První");
  await recordContentEntry(U, P, first);
  await recordContentEntry(U, P, entry("druhy", "Druhé"));
  const entries = libraryEntries(await deleteContentEntry(U, P, first.id));
  assert.deepEqual(
    entries.map((e) => e.brief.slug),
    ["druhy"]
  );
});

test("[firestore] projects and users are isolated", async () => {
  resetFirestore();
  await recordContentEntry(U, P, entry("skladovani", "Ořechy"));
  assert.equal(await getContentLibrary(U, "p-lib-fs-2"), null);
  assert.equal(await getContentLibrary("u-lib-fs-2", P), null);
});
