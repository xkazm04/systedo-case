/** Unit tests for the shared Block→Markdown serializer (article-reading #2 +
 *  article-content #4): the `BLOCK_TYPES` registry doubles as the coverage
 *  checklist — every block type the validator accepts must serialize to a
 *  non-empty Markdown fragment — and links/bold survive as `[text](href)` /
 *  `**text**` instead of collapsing to plain text. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articleFrontMatter,
  articleToMarkdown,
  blockToMarkdown,
  faqToMarkdown,
  inlineToMarkdown,
} from "@/lib/article-markdown";
import { BLOCK_TYPES } from "@/lib/article-validate";

/** One well-formed sample per block type. When a new type joins BLOCK_TYPES,
 *  the coverage test below fails until a sample (and a serializer case) exist. */
const SAMPLE_BLOCKS = {
  h2: { type: "h2", id: "sekce", text: "Sekce" },
  h3: { type: "h3", id: "podsekce", text: "Podsekce" },
  p: { type: "p", content: ["Odstavec s ", { text: "odkazem", href: "https://example.com", kind: "external" }, "."] },
  ul: { type: "ul", items: [["první"], ["druhá"]] },
  ol: { type: "ol", items: [["krok jedna"], ["krok dva"]] },
  callout: { type: "callout", variant: "tip", content: ["obsah tipu"] },
  quote: { type: "quote", content: ["citovaná věta"], cite: "Autorka" },
  cta: { type: "cta", text: "Prohlédněte si nabídku.", href: "https://example.com", kind: "external", cta: "Do obchodu" },
  stat: { type: "stat", items: [{ value: "42 %", label: "podíl" }] },
  figure: { type: "figure", src: "/clanek/prehled.svg", alt: "přehled druhů", caption: "Popisek obrázku", width: 1200, height: 600 },
  table: {
    type: "table",
    caption: "Srovnání druhů",
    header: ["Druh", "Cena | akce"],
    rows: [
      [[{ text: "vlašské", bold: true }], ["200 Kč"]],
      [["kešu"], [{ text: "ceník", href: "https://example.com", kind: "external" }]],
    ],
  },
};

test("every registered block type serializes to non-empty Markdown (BLOCK_TYPES is the checklist)", () => {
  for (const type of BLOCK_TYPES) {
    const sample = SAMPLE_BLOCKS[type];
    assert.ok(sample, `no sample block for type "${type}" — add one to this test`);
    const md = blockToMarkdown(sample);
    assert.ok(typeof md === "string" && md.length > 0, `blockToMarkdown returned empty for "${type}"`);
  }
});

test("inline links stay first-class ([text](href)) and bold becomes **text**", () => {
  const md = inlineToMarkdown([
    "Vyberte ",
    { text: "kvalitní ořechy", href: "https://www.mionelo.cz", kind: "external", campaign: "obsah" },
    " — ",
    { text: "opravdu", bold: true },
    " se to vyplatí, viz ",
    { text: "skladování", href: "#skladovani", kind: "anchor" },
    ".",
  ]);
  assert.equal(
    md,
    "Vyberte [kvalitní ořechy](https://www.mionelo.cz) — **opravdu** se to vyplatí, viz [skladování](#skladovani)."
  );
});

test("headings, lists and callouts serialize with their Markdown shapes", () => {
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.h2), "## Sekce");
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.h3), "### Podsekce");
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.ul), "- první\n- druhá");
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.ol), "1. krok jedna\n2. krok dva");
  // a title-less callout falls back to the label
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.callout), "> **Tip**\n> obsah tipu");
  // a custom label set (the AI draft panel passes its translator's strings)
  assert.equal(
    blockToMarkdown(SAMPLE_BLOCKS.callout, { calloutTitle: "Hint", faqHeading: "FAQ" }),
    "> **Hint**\n> obsah tipu"
  );
});

test("quote keeps its citation, figure its caption", () => {
  assert.equal(blockToMarkdown(SAMPLE_BLOCKS.quote), "> citovaná věta\n> — Autorka");
  assert.equal(
    blockToMarkdown(SAMPLE_BLOCKS.figure),
    "![přehled druhů](/clanek/prehled.svg)\n*Popisek obrázku*"
  );
});

test("table serializes as a GFM pipe table with escaped delimiters + caption", () => {
  assert.equal(
    blockToMarkdown(SAMPLE_BLOCKS.table),
    [
      "| Druh | Cena \\| akce |",
      "| --- | --- |",
      "| **vlašské** | 200 Kč |",
      "| kešu | [ceník](https://example.com) |",
      "*Srovnání druhů*",
    ].join("\n")
  );
});

test("faqToMarkdown renders the heading + Q/A pairs, empty FAQ renders nothing", () => {
  const md = faqToMarkdown([{ q: "Kolik ořechů denně?", a: ["Zhruba ", { text: "hrst", bold: true }, "."] }]);
  assert.match(md, /^## Časté dotazy \(FAQ\)/);
  assert.match(md, /\*\*Kolik ořechů denně\?\*\*/);
  assert.match(md, /Zhruba \*\*hrst\*\*\./);
  assert.equal(faqToMarkdown([]), "");
});

test("front matter quotes YAML scalars and carries the freshness fields", () => {
  const fm = articleFrontMatter({
    title: 'Ořechy: průvodce "výběrem"',
    perex: "Perex.",
    author: "Redakce",
    role: "Průvodce",
    dateISO: "2026-06-02",
    dateModifiedISO: "2026-06-12",
    readingMinutes: 8,
    category: "Zdravý jídelníček",
    tags: ["ořechy", "semínka"],
  });
  assert.match(fm, /^---\n/);
  assert.match(fm, /title: "Ořechy: průvodce \\"výběrem\\""/);
  assert.match(fm, /date: 2026-06-02/);
  assert.match(fm, /lastmod: 2026-06-12/);
  assert.match(fm, /tags: \["ořechy", "semínka"\]/);
  assert.match(fm, /\n---$/);
});

test("articleToMarkdown assembles front matter, H1, perex, blocks and FAQ into one document", () => {
  const doc = articleToMarkdown({
    meta: {
      title: "Testovací článek",
      perex: "Krátký perex.",
      author: "Test",
      role: "Autor",
      dateISO: "2026-01-01",
      readingMinutes: 3,
      category: "Test",
      tags: [],
    },
    blocks: [SAMPLE_BLOCKS.h2, SAMPLE_BLOCKS.p, SAMPLE_BLOCKS.stat],
    faq: [{ q: "Otázka?", a: ["Odpověď."] }],
  });
  const order = [
    doc.indexOf("---"),
    doc.indexOf("# Testovací článek"),
    doc.indexOf("_Krátký perex._"),
    doc.indexOf("## Sekce"),
    doc.indexOf("[odkazem](https://example.com)"),
    doc.indexOf("- **42 %** — podíl"),
    doc.indexOf("## Časté dotazy (FAQ)"),
    doc.indexOf("**Otázka?**"),
  ];
  for (let i = 0; i < order.length; i++) {
    assert.ok(order[i] >= 0, `part ${i} missing from the document`);
    if (i > 0) assert.ok(order[i] > order[i - 1], `part ${i} out of order`);
  }
  assert.ok(doc.endsWith("\n") && !doc.endsWith("\n\n"), "document ends with exactly one newline");
});
