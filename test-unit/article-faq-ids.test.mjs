/** Unit tests for FAQ deep-linking (article-reading #3): the effective FAQ
 *  anchor id (authored `id` or diacritics-aware slug of the question), the
 *  validator's shared-namespace checks (unique among the FAQ, never shadowing a
 *  heading id, never empty), and the UTM-stamped permalink artifact the copy
 *  buttons produce for headings and FAQ questions alike. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { faqItemId, validateArticle } from "@/lib/article-validate";
import { buildSectionPermalink } from "@/components/article/permalink";

/** A minimal well-formed article; tests mutate a fresh copy per case. */
const validArticle = () => ({
  meta: {
    title: "Testovací článek",
    perex: "Perex.",
    author: "Test",
    role: "Autor",
    dateISO: "2026-01-01",
    readingMinutes: 3,
    category: "Test",
    tags: [],
  },
  blocks: [{ type: "h2", id: "uvod", text: "Úvod" }],
  faq: [
    { q: "Kolik ořechů je tak akorát na den?", a: ["Hrst."] },
    { q: "Má smysl semínka namáčet?", a: ["Ano."], id: "namaceni" },
  ],
});

test("faqItemId prefers the authored id and falls back to a diacritics-aware slug", () => {
  assert.equal(faqItemId({ q: "Má smysl semínka namáčet?", id: "namaceni" }), "namaceni");
  assert.equal(faqItemId({ q: "Kolik ořechů je tak akorát na den?" }), "kolik-orechu-je-tak-akorat-na-den");
});

test("a valid article with mixed authored/derived FAQ ids passes", () => {
  const a = validateArticle(validArticle(), "test");
  assert.equal(a.faq.length, 2);
});

test("duplicate effective FAQ ids fail validation", () => {
  const a = validArticle();
  a.faq = [
    { q: "Stejná otázka?", a: ["Jedna."] },
    { q: "Jiná otázka?", a: ["Dvě."], id: "stejna-otazka" },
  ];
  assert.throws(() => validateArticle(a, "test"), /duplicate faq id/);
});

test("a FAQ id shadowing a heading id fails validation", () => {
  const a = validArticle();
  a.faq = [{ q: "Otázka?", a: ["Odpověď."], id: "uvod" }];
  assert.throws(() => validateArticle(a, "test"), /collides with a heading id/);
});

test("a question that derives an empty slug demands an explicit id", () => {
  const a = validArticle();
  a.faq = [{ q: "???", a: ["Odpověď."] }];
  assert.throws(() => validateArticle(a, "test"), /empty anchor id/);
});

test("buildSectionPermalink stamps the UTM tag and puts the id in the hash", () => {
  const link = buildSectionPermalink("https://example.com", "/clanek", "kolik-orechu-je-tak-akorat-na-den");
  const url = new URL(link);
  assert.equal(url.pathname, "/clanek");
  assert.equal(url.searchParams.get("utm_source"), "permalink");
  assert.equal(url.searchParams.get("utm_medium"), "anchor");
  assert.equal(url.searchParams.get("utm_campaign"), "clanek");
  assert.equal(url.hash, "#kolik-orechu-je-tak-akorat-na-den");
});
