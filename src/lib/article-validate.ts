/** The Article model's load-time validation guard, extracted into a framework-
 *  free module (no JSON/data import; the only runtime dependency is the pure
 *  `slugify` helper) so EVERY Article producer can run it — the hand-authored `article.json` singleton, the
 *  deterministic `snapshotToArticle` bridge behind `/clanek/vykon` and the
 *  `/m/{slug}` microsites, and (later) AI-drafted articles. Generated content is
 *  the surface most likely to drift, and until now it was the only one with
 *  zero protection. Pure and cheap (tens of blocks), unit-tested in
 *  `test-unit/article-validate.test.mjs`. */
import type { Article, Block, FaqItem, HeadingBlock, Inline } from "./article";
import { slugify } from "./nav";

/** Effective anchor id of a FAQ item: the authored `id` when present, otherwise
 *  a diacritics-aware slug of the question ("Kolik ořechů…" → "kolik-orechu-…").
 *  Single source for the renderer, the hash-open island and the validator, so
 *  the deep link and the DOM id can never drift apart. */
export function faqItemId(item: Pick<FaqItem, "q" | "id">): string {
  return item.id ?? slugify(item.q);
}

/** Registry of every renderable block type. Exported so the Markdown
 *  serializer's unit test can use it as a coverage checklist — a type accepted
 *  here must also serialize (`test-unit/article-markdown.test.mjs`). */
export const BLOCK_TYPES = new Set<Block["type"]>([
  "h2", "h3", "p", "ul", "ol", "callout", "quote", "cta", "stat", "figure", "table",
]);

/** Every `kind:"anchor"` href found in the article's inline content. */
function anchorHrefs(blocks: Block[]): string[] {
  const out: string[] = [];
  const scan = (inlines: Inline[]) => {
    for (const node of inlines) {
      if (typeof node === "object" && "href" in node && node.kind === "anchor") out.push(node.href);
    }
  };
  for (const b of blocks) {
    if (b.type === "p" || b.type === "callout" || b.type === "quote") scan(b.content);
    else if (b.type === "ul" || b.type === "ol") b.items.forEach(scan);
    else if (b.type === "table") for (const row of b.rows) row.forEach(scan);
  }
  return out;
}

/** Validate a raw value against the Article model, failing loudly (with the
 *  producer named in the message) instead of letting the renderer crash or
 *  silently emit invalid JSON-LD. The cast type-checks, but nothing else guards
 *  the data: an unknown block type, a figure missing src/alt/dimensions, an
 *  empty FAQ (Google requires ≥1 question for FAQPage), a dead `#anchor`, or a
 *  duplicate heading id. `source` labels which producer supplied the value. */
export function validateArticle(raw: unknown, source = "article.json"): Article {
  const fail = (msg: string): never => {
    throw new Error(`Invalid ${source}: ${msg}`);
  };
  if (!raw || typeof raw !== "object") return fail("not an object");
  const a = raw as Article;
  const m = a.meta;
  if (!m || typeof m.title !== "string" || !m.title) fail("meta.title is required");
  if (typeof m.dateISO !== "string" || !m.dateISO) fail("meta.dateISO is required");
  if (typeof m.readingMinutes !== "number") fail("meta.readingMinutes must be a number");
  if (!Array.isArray(a.blocks) || a.blocks.length === 0) fail("blocks must be a non-empty array");
  for (const [i, b] of a.blocks.entries()) {
    if (!b || !BLOCK_TYPES.has(b.type)) fail(`block[${i}] has an unknown type`);
    if (b.type === "figure" && (!b.src || !b.alt || !b.width || !b.height))
      fail(`figure block[${i}] needs src, alt, width and height`);
    if ((b.type === "h2" || b.type === "h3") && !b.id) fail(`heading block[${i}] needs an id`);
    if (b.type === "table") {
      if (!Array.isArray(b.header) || b.header.length === 0)
        fail(`table block[${i}] needs a non-empty header`);
      if (!Array.isArray(b.rows) || b.rows.some((r) => !Array.isArray(r) || r.length !== b.header.length))
        fail(`table block[${i}] rows must each have exactly ${b.header.length} cells`);
    }
  }
  if (!Array.isArray(a.faq) || a.faq.length === 0) fail("faq needs ≥1 item (FAQPage requires it)");

  // Anchor links must resolve to a real, unique heading id.
  const ids = a.blocks
    .filter((b): b is HeadingBlock => b.type === "h2" || b.type === "h3")
    .map((b) => b.id);
  if (new Set(ids).size !== ids.length) fail("duplicate heading id");
  const idSet = new Set(ids);

  // FAQ anchors share the page's id namespace with the headings: each effective
  // id (authored or slug-derived) must be non-empty, unique among the FAQ and
  // must not shadow a heading id — otherwise the deep link opens the wrong
  // element (mirrors the heading-id uniqueness check above).
  const faqIds = a.faq.map((f) => faqItemId(f));
  for (const [i, id] of faqIds.entries()) {
    if (!id) fail(`faq[${i}] derives an empty anchor id — give it an explicit "id"`);
    if (idSet.has(id)) fail(`faq id "${id}" collides with a heading id`);
  }
  if (new Set(faqIds).size !== faqIds.length) fail("duplicate faq id");
  for (const href of anchorHrefs(a.blocks)) {
    if (!idSet.has(href.replace(/^#/, ""))) fail(`anchor "${href}" has no matching heading id`);
  }
  return a;
}
