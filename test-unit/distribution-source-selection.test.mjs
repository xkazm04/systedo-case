/** "Distribute your actual article, not the fixture": the source-selection logic
 *  (src/lib/distribution/variants.ts) and the draft → source conversion
 *  (src/lib/distribution/from-draft.ts).
 *
 *  The two invariants worth fencing: a brand-new project must resolve to the
 *  fixture and nothing else (the fixture IS the empty state), and the user's own
 *  article must never be indistinguishable from it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// from-draft reuses the article renderer's inline flattener, and @/lib/article
// imports @/data/article.json — register the JSON hook before that graph loads.
register("./json-loader.mjs", import.meta.url);

const {
  articleKey,
  sanitizeSource,
  selectSource,
  sourceChoices,
  storedSources,
  upsertSource,
  upsertVariant,
  SOURCE_ARTICLE_CAP,
  SOURCE_BODY_MAX,
} = await import("@/lib/distribution/variants");
const { articleSourceFromDraft, draftArticleUrl, draftPlainText, DRAFT_FALLBACK_HOST } =
  await import("@/lib/distribution/from-draft");
const { SAMPLE_SOURCE } = await import("@/lib/distribution/sample");
const { repurpose } = await import("@/lib/distribution/generate");

const NOW = new Date("2026-08-03T10:00:00.000Z");
const mkSource = (title, url, body = "telo clanku") =>
  sanitizeSource({ title, url, body, savedAt: NOW.toISOString() }, NOW);

// --- selection -------------------------------------------------------------

test("with nothing stored the fixture is the source, whatever the selection says", () => {
  for (const selected of [null, "whatever", articleKey(SAMPLE_SOURCE)]) {
    const got = selectSource(SAMPLE_SOURCE, [], selected);
    assert.equal(got.origin, "sample");
    assert.deepEqual(got.source, SAMPLE_SOURCE);
    assert.equal(got.key, articleKey(SAMPLE_SOURCE));
  }
});

test("once an article is handed over it becomes the default — that's why the user came", () => {
  const mine = mkSource("Muj clanek", "https://mojedomena.cz/muj-clanek", "prvni odstavec");
  const got = selectSource(SAMPLE_SOURCE, [mine], null);
  assert.equal(got.origin, "project");
  assert.equal(got.source.title, "Muj clanek");
  assert.equal(got.source.url, "https://mojedomena.cz/muj-clanek");
  assert.equal(got.source.body, "prvni odstavec");
  assert.equal(got.key, mine.articleKey);
});

test("the newest handed-over article wins the default", () => {
  const older = mkSource("Starsi", "https://d.cz/a");
  const newer = mkSource("Novejsi", "https://d.cz/b");
  // upsertSource keeps newest-first, which is the order the picker/default read.
  const state = upsertSource(upsertSource(null, older, SOURCE_ARTICLE_CAP, NOW), newer, SOURCE_ARTICLE_CAP, NOW);
  assert.equal(selectSource(SAMPLE_SOURCE, storedSources(state), null).source.title, "Novejsi");
});

test("the fixture stays explicitly selectable next to real articles", () => {
  const mine = mkSource("Muj clanek", "https://d.cz/a");
  const got = selectSource(SAMPLE_SOURCE, [mine], articleKey(SAMPLE_SOURCE));
  assert.equal(got.origin, "sample");
  assert.deepEqual(got.source, SAMPLE_SOURCE);
});

test("a stale or unknown key falls back to the default instead of throwing or blanking", () => {
  const mine = mkSource("Muj clanek", "https://d.cz/a");
  const got = selectSource(SAMPLE_SOURCE, [mine], "deleted-key");
  assert.equal(got.origin, "project");
  assert.equal(got.key, mine.articleKey);
});

test("every choice is labelled by origin, with the fixture last", () => {
  const mine = mkSource("Muj clanek", "https://d.cz/a");
  const choices = sourceChoices(SAMPLE_SOURCE, [mine]);
  assert.deepEqual(
    choices.map((c) => c.origin),
    ["project", "sample"]
  );
  assert.equal(choices.at(-1).key, articleKey(SAMPLE_SOURCE));
  // A fresh project's only choice is the fixture — and it is still labelled as one.
  assert.deepEqual(sourceChoices(SAMPLE_SOURCE, []), [
    { key: articleKey(SAMPLE_SOURCE), title: SAMPLE_SOURCE.title, origin: "sample" },
  ]);
});

test("a real article actually repurposes — the variants carry ITS title and link", () => {
  const mine = mkSource("Jak jsme zdvojnasobili konverze", "https://mojedomena.cz/konverze", "Prvni odstavec o konverzich.\n\nDruhy odstavec.");
  const { source } = selectSource(SAMPLE_SOURCE, [mine], null);
  const variants = repurpose(source);
  assert.ok(variants.length > 0);
  for (const v of variants) {
    assert.ok(v.link.startsWith("https://mojedomena.cz/konverze?"), `stale link: ${v.link}`);
    assert.ok(!v.text.includes(SAMPLE_SOURCE.title), "the fixture's headline leaked into a real article's variant");
  }
  assert.ok(variants.some((v) => v.text.includes("Jak jsme zdvojnasobili konverze")));
});

// --- storing the handoff ---------------------------------------------------

test("re-sending a revised draft updates in place instead of duplicating", () => {
  const first = mkSource("Muj clanek", "https://d.cz/a", "v1");
  const second = mkSource("Muj clanek", "https://d.cz/a", "v2");
  const state = upsertSource(upsertSource(null, first, SOURCE_ARTICLE_CAP, NOW), second, SOURCE_ARTICLE_CAP, NOW);
  assert.equal(storedSources(state).length, 1);
  assert.equal(storedSources(state)[0].body, "v2");
});

test("stored sources are capped, oldest off the tail", () => {
  let state = null;
  for (let i = 0; i < SOURCE_ARTICLE_CAP + 3; i++) {
    state = upsertSource(state, mkSource(`Clanek ${i}`, `https://d.cz/${i}`), SOURCE_ARTICLE_CAP, NOW);
  }
  assert.equal(storedSources(state).length, SOURCE_ARTICLE_CAP);
  assert.equal(storedSources(state)[0].title, `Clanek ${SOURCE_ARTICLE_CAP + 2}`);
});

test("saving a variant carries the handed-over sources through untouched", () => {
  const mine = mkSource("Muj clanek", "https://d.cz/a");
  let state = upsertSource(null, mine, SOURCE_ARTICLE_CAP, NOW);
  state = upsertVariant(
    state,
    mine.articleKey,
    mine.title,
    { channel: "LinkedIn", text: "moje verze", status: "edited", updatedAt: NOW.toISOString() },
    25,
    NOW
  );
  assert.equal(storedSources(state).length, 1, "the variant write un-handed-over the article");
  assert.equal(state.articles.length, 1);
});

test("an article with no usable title or URL is refused, not stored broken", () => {
  assert.equal(sanitizeSource({ title: "", url: "https://d.cz/a" }, NOW), null);
  assert.equal(sanitizeSource({ title: "T", url: "" }, NOW), null);
  assert.equal(sanitizeSource({ title: "T", url: "not a url" }, NOW), null);
  // A non-http scheme must never reach the UTM stamper / an <a href>.
  assert.equal(sanitizeSource({ title: "T", url: "javascript:alert(1)" }, NOW), null);
  assert.equal(sanitizeSource(null, NOW), null);
});

test("a stored article is bounded and keyed from its own title+url", () => {
  const s = sanitizeSource({ title: " T ", url: "https://d.cz/a", body: "x".repeat(SOURCE_BODY_MAX + 100) }, NOW);
  assert.equal(s.title, "T");
  assert.equal(s.body.length, SOURCE_BODY_MAX);
  assert.equal(s.articleKey, articleKey({ title: "T", url: "https://d.cz/a" }));
});

// --- draft → source conversion --------------------------------------------

const BLOCKS = [
  { type: "h2", id: "a", text: "Jak na to" },
  { type: "p", content: ["Prvni ", { text: "odstavec", bold: true }, "."] },
  { type: "ul", items: [["bod jedna"], ["bod dva"]] },
  { type: "callout", variant: "tip", title: "Tip", content: ["Zkuste to."] },
  { type: "figure", src: "/x.png", alt: "obrazek", width: 10, height: 10 },
  { type: "cta", text: "Ctete dal", href: "/x", kind: "internal", cta: "Sem" },
];

test("the draft body becomes plain prose — no markdown markers to repurpose", () => {
  const text = draftPlainText(BLOCKS);
  assert.ok(text.includes("Prvni odstavec."), "inline bold must flatten to text");
  assert.ok(text.includes("- bod jedna"));
  assert.ok(text.includes("Tip: Zkuste to."));
  assert.ok(!text.includes("##") && !text.includes("**"), "markdown markers would be repurposed as content");
  // Layout-only blocks contribute nothing.
  assert.ok(!text.includes("obrazek"));
});

test("the draft URL uses the project's own domain when it has one", () => {
  assert.equal(draftArticleUrl("mojedomena.cz", "Jak na to"), "https://mojedomena.cz/jak-na-to");
  assert.equal(draftArticleUrl("https://mojedomena.cz/", "Jak na to"), "https://mojedomena.cz/jak-na-to");
  assert.equal(draftArticleUrl(undefined, "Jak na to"), `https://${DRAFT_FALLBACK_HOST}/jak-na-to`);
  // Always parseable — the UTM stamper builds a URL from it.
  assert.doesNotThrow(() => new URL(draftArticleUrl("", "")));
});

test("the converted source carries a real body, which is what keeps backfill honest", () => {
  const src = articleSourceFromDraft({ title: "Jak na to", blocks: BLOCKS, domain: "mojedomena.cz" });
  assert.equal(src.title, "Jak na to");
  assert.equal(src.url, "https://mojedomena.cz/jak-na-to");
  assert.ok(src.body.length > 20);
  // The repurpose tool grounds on `body`; a bodyless handoff would make the AI
  // path report a full backfill for content the user actually wrote.
  const variants = repurpose(src);
  assert.ok(variants.some((v) => v.text.includes("Prvni odstavec")));
});

test("a body-less draft omits `body` rather than emitting an empty one", () => {
  const src = articleSourceFromDraft({ title: "Jen nadpis", blocks: [] });
  assert.equal("body" in src, false);
  // Still fully usable: the deterministic repurpose falls back to its generic lead.
  assert.equal(repurpose(src).length, 4);
});

test("a handed-over article and the fixture never collide on a key", () => {
  const mine = mkSource(SAMPLE_SOURCE.title, "https://mojedomena.cz/jiny");
  assert.notEqual(mine.articleKey, articleKey(SAMPLE_SOURCE));
  assert.equal(selectSource(SAMPLE_SOURCE, [mine], articleKey(SAMPLE_SOURCE)).origin, "sample");
});
