/** The saved content library — the pure model (src/lib/content-library/entries.ts)
 *  plus a real roundtrip through the store on the LOCAL_DB sqlite backend
 *  (src/lib/content-library/store.ts → project_state). The Firestore backend of the
 *  same store is covered by content-library-firestore.test.mjs.
 *
 *  The bug being fenced: every generated brief and article draft lived ONLY in
 *  localStorage (`systedo.ai.result.*`), so clearing site data or opening the app on
 *  another machine destroyed the work unless the user had remembered to download it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-content-library-test.db");
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
  contentEntryId,
  libraryEntries,
  removeEntry,
  sanitizeEntry,
  upsertEntry,
  ENTRY_MAX_BYTES,
  LIBRARY_CAP,
  LIBRARY_MAX_BYTES,
} = await import("@/lib/content-library/entries");
const { getContentLibrary, recordContentEntry, deleteContentEntry } = await import(
  "@/lib/content-library/store"
);

const NOW = new Date("2026-08-04T09:00:00.000Z");
const U = "user-lib-1";
const P = "proj-lib-1";

const brief = (over = {}) => ({
  titleTag: "Jak skladovat ořechy",
  metaDescription: "Praktický návod, jak udržet ořechy čerstvé.",
  h1: "Jak skladovat ořechy a semínka",
  slug: "skladovani-orechu",
  outline: [{ heading: "Proč ořechy žluknou", points: ["oxidace", "světlo"] }],
  faq: [{ question: "Jak dlouho vydrží?", answer: "Půl roku v mrazáku." }],
  keywords: ["skladování ořechů", "žluknutí"],
  internalLinks: ["/blog/orechy"],
  rationale: "Vysoká poptávka, nízká konkurence.",
  ...over,
});

const form = { topic: "Skladování ořechů", primaryKeyword: "skladování ořechů", audience: "Kupující ve velkém", contentType: "blog" };
const meta = { model: "gemini-2.5-flash", demo: false, tookMs: 4200, prompt: "SYSTEM: …a very long prompt…" };

// --- the pure model -------------------------------------------------------

test("sanitizeEntry keeps a brief, records what produced it, and drops the prompt", () => {
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta }, NOW);
  assert.equal(e.kind, "brief");
  assert.equal(e.title, "Jak skladovat ořechy a semínka");
  assert.equal(e.brief.slug, "skladovani-orechu");
  assert.equal(e.form.topic, "Skladování ořechů");
  assert.equal(e.briefMeta.model, "gemini-2.5-flash");
  assert.equal(e.savedAt, NOW.toISOString());
  assert.equal("prompt" in e.briefMeta, false, "the prompt is the biggest field and is never stored");
});

test("sanitizeEntry refuses a payload with no usable brief", () => {
  assert.equal(sanitizeEntry(null, NOW), null);
  assert.equal(sanitizeEntry({ brief: { titleTag: "", h1: "" } }, NOW), null);
  assert.equal(sanitizeEntry({ form }, NOW), null);
});

test("a draft promotes the entry to an article and survives the roundtrip", () => {
  const draft = {
    blocks: [
      { type: "h2", id: "proc", text: "Proč žluknou" },
      { type: "p", content: ["Ořechy oxidují.", { text: "více zde", href: "/blog", kind: "internal" }] },
      { type: "ul", items: [["chlad"], ["tma"]] },
    ],
    faq: [{ q: "Do mrazáku?", a: ["Ano."] }],
  };
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta, draft, draftMeta: meta }, NOW);
  assert.equal(e.kind, "article");
  assert.equal(e.draft.blocks.length, 3);
  assert.equal(e.draft.faq[0].q, "Do mrazáku?");
});

test("an inserted image is stripped: the placeholder survives, the data URL does not", () => {
  const huge = `data:image/png;base64,${"A".repeat(40_000)}`;
  const draft = {
    blocks: [
      { type: "figure", src: huge, alt: "Ořechy ve sklenici", caption: "Sklenice", width: 800, height: 600 },
      { type: "p", content: ["Text."] },
    ],
    faq: [],
  };
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta, draft, draftMeta: meta }, NOW);
  const fig = e.draft.blocks.find((b) => b.type === "figure");
  assert.equal(fig.src, "", "the data URL never reaches the store");
  assert.equal(fig.alt, "Ořechy ve sklenici");
  assert.ok(JSON.stringify(e).length < ENTRY_MAX_BYTES, "the entry stays inside its budget");
  assert.equal(JSON.stringify(e).includes("base64"), false);
});

test("an oversized draft degrades to a brief-only entry instead of losing the save", () => {
  const blocks = Array.from({ length: 199 }, () => ({ type: "p", content: ["x".repeat(3_000)] }));
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta, draft: { blocks, faq: [] }, draftMeta: meta }, NOW);
  assert.equal(e.kind, "brief");
  assert.equal(e.draft, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(e), "utf8") <= ENTRY_MAX_BYTES);
});

test("unknown block shapes are dropped rather than stored for the renderer to choke on", () => {
  const draft = {
    blocks: [{ type: "table", header: ["a"], rows: [] }, { type: "nonsense" }, { type: "p", content: ["ok"] }],
    faq: [],
  };
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta, draft, draftMeta: meta }, NOW);
  assert.deepEqual(
    e.draft.blocks.map((b) => b.type),
    ["p"]
  );
});

test("re-saving the same piece of work updates its entry instead of duplicating it", () => {
  const a = sanitizeEntry({ form, brief: brief(), briefMeta: meta }, NOW);
  const b = sanitizeEntry(
    { form, brief: brief({ metaDescription: "Přepsaný popis." }), briefMeta: meta },
    new Date("2026-08-04T10:00:00.000Z")
  );
  assert.equal(a.id, b.id);
  const state = upsertEntry(upsertEntry(null, a), b);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].brief.metaDescription, "Přepsaný popis.");
});

test("contentEntryId separates two different topics that share a slug", () => {
  const b = brief();
  assert.notEqual(contentEntryId(b, "téma A"), contentEntryId(b, "téma B"));
});

test("the library is capped by count, newest first, oldest pruned", () => {
  let state = null;
  for (let i = 0; i < LIBRARY_CAP + 5; i++) {
    const e = sanitizeEntry({ form: { ...form, topic: `téma ${i}` }, brief: brief({ slug: `slug-${i}` }), briefMeta: meta }, NOW);
    state = upsertEntry(state, e);
  }
  assert.equal(state.entries.length, LIBRARY_CAP);
  assert.equal(state.entries[0].form.topic, `téma ${LIBRARY_CAP + 4}`, "newest first");
});

test("the library is also capped by bytes, and the newest save is never the one pruned", () => {
  let state = null;
  const bigDraft = {
    blocks: Array.from({ length: 12 }, () => ({ type: "p", content: ["y".repeat(3_000)] })),
    faq: [],
  };
  for (let i = 0; i < LIBRARY_CAP; i++) {
    const e = sanitizeEntry(
      { form: { ...form, topic: `téma ${i}` }, brief: brief({ slug: `slug-${i}` }), briefMeta: meta, draft: bigDraft, draftMeta: meta },
      NOW
    );
    state = upsertEntry(state, e);
  }
  const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  assert.ok(bytes <= LIBRARY_MAX_BYTES, `blob is ${bytes} bytes, over the library budget`);
  assert.equal(state.entries[0].form.topic, `téma ${LIBRARY_CAP - 1}`);
  // …and comfortably under what the project_state dispatcher accepts (900 KB).
  assert.ok(bytes < 900 * 1024);
});

test("removeEntry drops exactly one entry", () => {
  const a = sanitizeEntry({ form, brief: brief({ slug: "a" }), briefMeta: meta }, NOW);
  const b = sanitizeEntry({ form: { ...form, topic: "jiné" }, brief: brief({ slug: "b" }), briefMeta: meta }, NOW);
  const state = upsertEntry(upsertEntry(null, a), b);
  const after = removeEntry(state, a.id);
  assert.deepEqual(
    after.entries.map((e) => e.id),
    [b.id]
  );
});

test("libraryEntries is [] for a project that never saved", () => {
  assert.deepEqual(libraryEntries(null), []);
  assert.deepEqual(libraryEntries({ updatedAt: NOW.toISOString() }), []);
});

// --- the store, on the LOCAL_DB sqlite backend -----------------------------

test("[local] an unsaved project reads back null", async () => {
  assert.equal(await getContentLibrary(U, P), null);
});

test("[local] a saved brief survives the roundtrip", async () => {
  const e = sanitizeEntry({ form, brief: brief(), briefMeta: meta }, NOW);
  await recordContentEntry(U, P, e);
  const entries = libraryEntries(await getContentLibrary(U, P));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Jak skladovat ořechy a semínka");
  assert.equal(entries[0].brief.outline[0].heading, "Proč ořechy žluknou");
});

test("[local] a second save is added, newest first, and a delete removes it", async () => {
  const second = sanitizeEntry(
    { form: { ...form, topic: "Druhé téma" }, brief: brief({ slug: "druhy" }), briefMeta: meta },
    new Date("2026-08-04T11:00:00.000Z")
  );
  await recordContentEntry(U, P, second);
  let entries = libraryEntries(await getContentLibrary(U, P));
  assert.deepEqual(
    entries.map((e) => e.brief.slug),
    ["druhy", "skladovani-orechu"]
  );
  entries = libraryEntries(await deleteContentEntry(U, P, second.id));
  assert.deepEqual(
    entries.map((e) => e.brief.slug),
    ["skladovani-orechu"]
  );
});

test("[local] projects and users are isolated", async () => {
  assert.equal(await getContentLibrary(U, "proj-lib-2"), null);
  assert.equal(await getContentLibrary("user-lib-2", P), null);
});
