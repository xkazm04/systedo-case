/** Persisted Distribuce variants — the pure model (src/lib/distribution/variants.ts)
 *  plus a real roundtrip through the store on the LOCAL_DB sqlite backend
 *  (src/lib/distribution/variants-store.ts → project_state). The Firestore backend
 *  of the same store is covered by distribution-variants-firestore.test.mjs.
 *
 *  The bug being fenced: every edited/AI-regenerated variant lived in a component
 *  useState, so switching tabs silently threw the user's work away. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-distribution-variants-test.db");
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
  advanceStatus,
  applyStoredVariants,
  articleKey,
  emptyVariantState,
  sanitizeVariant,
  upsertVariant,
  variantsForArticle,
  VARIANT_ARTICLE_CAP,
  VARIANT_TEXT_MAX,
} = await import("@/lib/distribution/variants");
const { getVariants, recordVariant } = await import("@/lib/distribution/variants-store");

const NOW = new Date("2026-08-03T10:00:00.000Z");
const A1 = { title: "Jak na distribuci", url: "https://blog.example.cz/distribuce" };
const A2 = { title: "Jak na distribuci", url: "https://blog.example.cz/jiny-clanek" };
const variant = (channel, text, status = "edited") => ({
  channel,
  text,
  status,
  updatedAt: NOW.toISOString(),
});

// --- article identity -------------------------------------------------------

test("the article key is stable and separates two articles that share a title", () => {
  assert.equal(articleKey(A1), articleKey({ ...A1 }));
  assert.notEqual(articleKey(A1), articleKey(A2));
  // A titleless draft still gets its own key rather than collapsing onto a shared one.
  assert.notEqual(articleKey({ title: "", url: "https://a.cz/x" }), articleKey({ title: "", url: "https://a.cz/y" }));
});

// --- pure transitions -------------------------------------------------------

test("upsert replaces a channel in place rather than duplicating it", () => {
  let s = emptyVariantState(NOW);
  s = upsertVariant(s, "k1", "T", variant("LinkedIn", "v1"), VARIANT_ARTICLE_CAP, NOW);
  s = upsertVariant(s, "k1", "T", variant("LinkedIn", "v2"), VARIANT_ARTICLE_CAP, NOW);
  s = upsertVariant(s, "k1", "T", variant("Instagram", "i1"), VARIANT_ARTICLE_CAP, NOW);
  assert.equal(s.articles.length, 1);
  assert.equal(s.articles[0].variants.length, 2);
  assert.equal(variantsForArticle(s, "k1").LinkedIn.text, "v2");
});

test("articles are kept most-recently-touched first and capped", () => {
  let s = null;
  for (let i = 0; i < VARIANT_ARTICLE_CAP + 3; i++) {
    s = upsertVariant(s, `k${i}`, `T${i}`, variant("LinkedIn", `v${i}`), VARIANT_ARTICLE_CAP, NOW);
  }
  assert.equal(s.articles.length, VARIANT_ARTICLE_CAP);
  assert.equal(s.articles[0].articleKey, `k${VARIANT_ARTICLE_CAP + 2}`);
  // The oldest fell off, and with it its variants — not some other article's.
  assert.deepEqual(variantsForArticle(s, "k0"), {});
});

test("an unstored article reads back an empty map (a fresh project changes nothing)", () => {
  assert.deepEqual(variantsForArticle(null, "k1"), {});
  assert.deepEqual(variantsForArticle(emptyVariantState(NOW), "k1"), {});
});

test("stored text overlays fresh variants without resurrecting stale links", () => {
  const fresh = [
    { channel: "LinkedIn", text: "det-li", link: "https://x?utm_source=linkedin", max: 3000 },
    { channel: "Instagram", text: "det-ig", link: "https://x?utm_source=instagram", max: 2200 },
  ];
  const out = applyStoredVariants(fresh, { LinkedIn: variant("LinkedIn", "moje verze") });
  assert.equal(out[0].text, "moje verze");
  assert.equal(out[0].link, fresh[0].link, "the link must always come from the fresh repurpose");
  assert.equal(out[1].text, "det-ig", "an unstored channel keeps the deterministic draft");
  // A stored channel that no longer exists is ignored, never re-added.
  assert.equal(applyStoredVariants(fresh, { Facebook: variant("Facebook", "x") }).length, 2);
});

test("nothing stored → the overlay is byte-identical to the deterministic output", () => {
  const fresh = [{ channel: "LinkedIn", text: "det", link: "l", max: 10 }];
  assert.deepEqual(applyStoredVariants(fresh, {}), fresh);
});

// --- status ----------------------------------------------------------------

test("status advances on handoff and never falls back on its own", () => {
  assert.equal(advanceStatus(undefined, "generated"), "generated");
  assert.equal(advanceStatus("generated", "edited", true), "edited");
  assert.equal(advanceStatus("edited", "handed_off"), "handed_off");
  // Copying an already handed-off variant again keeps it handed off.
  assert.equal(advanceStatus("handed_off", "handed_off"), "handed_off");
  // A re-copy must not demote a handed-off variant back to "edited".
  assert.equal(advanceStatus("handed_off", "edited", false), "handed_off");
});

test("a NEW version of the text after a handoff is honestly not handed off", () => {
  assert.equal(advanceStatus("handed_off", "edited", true), "edited");
  assert.equal(advanceStatus("handed_off", "generated", true), "generated");
});

// --- trust boundary --------------------------------------------------------

test("a client-echoed entry is bounded and its channel is forced from the trusted arg", () => {
  const v = sanitizeVariant(
    { channel: "../../evil", text: "x".repeat(VARIANT_TEXT_MAX + 500), status: "root", updatedAt: 42 },
    "LinkedIn",
    NOW
  );
  assert.equal(v.channel, "LinkedIn");
  assert.equal(v.text.length, VARIANT_TEXT_MAX);
  assert.equal(v.status, "edited");
  assert.equal(v.updatedAt, NOW.toISOString());
  // Junk in, valid entry out — never a throw into the save path.
  assert.deepEqual(sanitizeVariant(null, "X", NOW).text, "");
});

// --- LOCAL_DB backend roundtrip --------------------------------------------

const U = "u-variants-1";
const P = "p-variants-1";

test("[sqlite] an unsaved project reads back null", async () => {
  assert.equal(await getVariants(U, P), null);
});

test("[sqlite] an edit survives — save, then read back as a different caller would", async () => {
  const key = articleKey(A1);
  await recordVariant(U, P, key, A1.title, variant("LinkedIn", "moje verze", "edited"));
  const state = await getVariants(U, P);
  assert.equal(variantsForArticle(state, key).LinkedIn.text, "moje verze");
  assert.equal(variantsForArticle(state, key).LinkedIn.status, "edited");
});

test("[sqlite] a second channel joins the same article instead of replacing it", async () => {
  const key = articleKey(A1);
  await recordVariant(U, P, key, A1.title, variant("Instagram", "ig verze", "generated"));
  const stored = variantsForArticle(await getVariants(U, P), key);
  assert.equal(Object.keys(stored).sort().join(","), "Instagram,LinkedIn");
  assert.equal(stored.LinkedIn.text, "moje verze");
});

test("[sqlite] a handoff advances the stored status", async () => {
  const key = articleKey(A1);
  await recordVariant(U, P, key, A1.title, variant("LinkedIn", "moje verze", "handed_off"));
  assert.equal(variantsForArticle(await getVariants(U, P), key).LinkedIn.status, "handed_off");
});

test("[sqlite] a second article does not disturb the first, and other projects are isolated", async () => {
  await recordVariant(U, P, articleKey(A2), A2.title, variant("LinkedIn", "druhy clanek"));
  const state = await getVariants(U, P);
  assert.equal(variantsForArticle(state, articleKey(A1)).LinkedIn.text, "moje verze");
  assert.equal(variantsForArticle(state, articleKey(A2)).LinkedIn.text, "druhy clanek");
  assert.equal(await getVariants(U, "p-variants-2"), null);
  assert.equal(await getVariants("u-variants-2", P), null);
});
