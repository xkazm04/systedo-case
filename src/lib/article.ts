import data from "@/data/article.json";

/** A small "headless CMS" content model. The article is stored as structured
 *  JSON (src/data/article.json) and rendered by a typed renderer — so it counts
 *  as JSON persistence, keeps links first-class (internal / external / anchor),
 *  and lets us derive the table of contents and FAQ schema automatically. */

export type Inline =
  | string
  | { text: string; href: string; kind: "internal" | "external" | "anchor" }
  | { text: string; bold: true };

export interface HeadingBlock {
  type: "h2" | "h3";
  id: string;
  text: string;
}
export interface ParagraphBlock {
  type: "p";
  content: Inline[];
}
export interface ListBlock {
  type: "ul" | "ol";
  items: Inline[][];
}
export interface CalloutBlock {
  type: "callout";
  variant: "tip" | "info" | "warn";
  title?: string;
  content: Inline[];
}
export interface QuoteBlock {
  type: "quote";
  content: Inline[];
  cite?: string;
}
export interface CtaBlock {
  type: "cta";
  text: string;
  href: string;
  kind: "internal" | "external";
  cta: string;
}
export interface StatBlock {
  type: "stat";
  items: { value: string; label: string }[];
}
/** A first-class image, rendered via next/image with a styled caption and
 *  auto-promoted into the Article JSON-LD graph as an ImageObject. `src` is a
 *  site-relative path (e.g. /clanek/foo.svg); width/height are the intrinsic
 *  dimensions used to reserve layout space and avoid CLS. */
export interface FigureBlock {
  type: "figure";
  src: string;
  alt: string;
  caption?: string;
  /** Intrinsic dimensions — REQUIRED: they feed both the JSON-LD ImageObject and
   *  next/image's CLS reservation, both of which degrade silently if omitted.
   *  Enforced at load by parseArticle. */
  width: number;
  height: number;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CalloutBlock
  | QuoteBlock
  | CtaBlock
  | StatBlock
  | FigureBlock;

export interface FaqItem {
  q: string;
  a: Inline[];
}

export interface Article {
  meta: {
    title: string;
    perex: string;
    author: string;
    role: string;
    /** Optional E-E-A-T byline fields — kept optional so the model stays headless. */
    authorCredential?: string;
    authorBio?: string;
    authorUrl?: string;
    dateISO: string;
    /** Last meaningful update; powers the freshness stamp + Article.dateModified. */
    dateModifiedISO?: string;
    readingMinutes: number;
    category: string;
    tags: string[];
  };
  blocks: Block[];
  faq: FaqItem[];
}

const BLOCK_TYPES = new Set<Block["type"]>([
  "h2", "h3", "p", "ul", "ol", "callout", "quote", "cta", "stat", "figure",
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
  }
  return out;
}

/** Validate the hand-authored JSON against the Article model at load time, failing
 *  the BUILD (not the page) on a malformed entry. The cast type-checks, but nothing
 *  else guarded the data: an unknown block type, a figure missing src/alt, an empty
 *  FAQ (Google requires ≥1 question for FAQPage), a dead `#anchor`, or a duplicate
 *  heading id would otherwise crash the renderer or silently emit invalid JSON-LD —
 *  a risk that grows the moment the content model spans more than one file. */
function parseArticle(raw: unknown): Article {
  const fail = (msg: string): never => {
    throw new Error(`Invalid article.json: ${msg}`);
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
  }
  if (!Array.isArray(a.faq) || a.faq.length === 0) fail("faq needs ≥1 item (FAQPage requires it)");

  // Anchor links must resolve to a real, unique heading id.
  const ids = a.blocks
    .filter((b): b is HeadingBlock => b.type === "h2" || b.type === "h3")
    .map((b) => b.id);
  if (new Set(ids).size !== ids.length) fail("duplicate heading id");
  const idSet = new Set(ids);
  for (const href of anchorHrefs(a.blocks)) {
    if (!idSet.has(href.replace(/^#/, ""))) fail(`anchor "${href}" has no matching heading id`);
  }
  return a;
}

export const article = parseArticle(data);

/** Plain-text helper for the FAQ JSON-LD (strips link/bold wrappers). */
export function inlineToText(content: Inline[]): string {
  return content
    .map((node) => (typeof node === "string" ? node : node.text))
    .join("");
}

/** Table of contents derived from the H2 headings only — H3 are sub-points
 *  (e.g. the "Malý přehled" entries) deliberately kept out to keep the ToC scannable. */
export function tableOfContents(a: Article): { id: string; text: string }[] {
  return a.blocks
    .filter((b): b is HeadingBlock => b.type === "h2")
    .map((b) => ({ id: b.id, text: b.text }));
}

/** Figure blocks in document order — used to promote images into the Article
 *  JSON-LD graph (ImageObject nodes + the Article `image` array). */
export function figureBlocks(a: Article): FigureBlock[] {
  return a.blocks.filter((b): b is FigureBlock => b.type === "figure");
}
