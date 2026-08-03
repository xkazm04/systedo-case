/** The same persisted-variants store on the OTHER backend: LOCAL_DB off, so the
 *  project_state dispatcher resolves to src/lib/project-state/store.firestore.ts,
 *  with `@/lib/firebase` redirected to an in-memory fake (./firestore-fake.mjs).
 *
 *  Worth its own file: "works on both backends" is a claim, and the two backends
 *  are genuinely different code (doc-id composition + a JSON string field vs. a
 *  sqlite upsert). Without this, a Firestore-only regression would ship green. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Swap `@/lib/firebase` for the fake BEFORE anything imports the store. Hooks run
// most-recently-registered first, so this wins over the shared `@/` mapping.
register("./firestore-fake-hook.mjs", import.meta.url);

// LOCAL_DB deliberately unset → the dispatcher picks the Firestore backend.
delete process.env.LOCAL_DB;

const { firestoreDump, resetFirestore } = await import("./firestore-fake.mjs");
const { articleKey, variantsForArticle } = await import("@/lib/distribution/variants");
const { getVariants, recordVariant, saveVariants } = await import(
  "@/lib/distribution/variants-store"
);

const NOW = "2026-08-03T10:00:00.000Z";
const A = { title: "Jak na distribuci", url: "https://blog.example.cz/distribuce" };
const KEY = articleKey(A);
const U = "u-fs-1";
const P = "p-fs-1";
const variant = (channel, text, status = "edited") => ({ channel, text, status, updatedAt: NOW });

test("[firestore] an unsaved project reads back null", async () => {
  resetFirestore();
  assert.equal(await getVariants(U, P), null);
});

test("[firestore] an edit survives the roundtrip", async () => {
  resetFirestore();
  await recordVariant(U, P, KEY, A.title, variant("LinkedIn", "moje verze"));
  const stored = variantsForArticle(await getVariants(U, P), KEY);
  assert.equal(stored.LinkedIn.text, "moje verze");
  assert.equal(stored.LinkedIn.status, "edited");
});

test("[firestore] the blob lands under the per-(user, project, key) doc id", async () => {
  resetFirestore();
  await recordVariant(U, P, KEY, A.title, variant("LinkedIn", "moje verze"));
  const paths = [...firestoreDump().keys()];
  assert.deepEqual(paths, [`users/${U}/projectState/${P}__distributionVariants`]);
});

test("[firestore] a re-save replaces the whole blob, keeping both channels", async () => {
  resetFirestore();
  await recordVariant(U, P, KEY, A.title, variant("LinkedIn", "li"));
  await recordVariant(U, P, KEY, A.title, variant("Instagram", "ig", "generated"));
  await recordVariant(U, P, KEY, A.title, variant("LinkedIn", "li2", "handed_off"));
  const stored = variantsForArticle(await getVariants(U, P), KEY);
  assert.equal(Object.keys(stored).sort().join(","), "Instagram,LinkedIn");
  assert.equal(stored.LinkedIn.text, "li2");
  assert.equal(stored.LinkedIn.status, "handed_off");
  assert.equal(firestoreDump().size, 1, "one doc per (project, key) — no fan-out");
});

test("[firestore] projects and users are isolated", async () => {
  resetFirestore();
  await recordVariant(U, P, KEY, A.title, variant("LinkedIn", "mine"));
  assert.equal(await getVariants(U, "p-fs-2"), null);
  assert.equal(await getVariants("u-fs-2", P), null);
});

test("[firestore] a corrupt stored blob reads back null instead of throwing", async () => {
  resetFirestore();
  await saveVariants(U, P, { articles: [], updatedAt: NOW });
  // Simulate an interrupted write: replace the JSON string with garbage.
  const path = `users/${U}/projectState/${P}__distributionVariants`;
  const { firestore } = await import("./firestore-fake.mjs");
  await firestore
    .collection("users")
    .doc(U)
    .collection("projectState")
    .doc(`${P}__distributionVariants`)
    .set({ data: "{not json", updatedAt: NOW });
  assert.ok([...firestoreDump().keys()].includes(path));
  const origErr = console.error;
  let logged = false;
  console.error = () => {
    logged = true;
  };
  try {
    assert.equal(await getVariants(U, P), null);
  } finally {
    console.error = origErr;
  }
  assert.ok(logged, "a corrupt blob is logged, not silently swallowed");
});
