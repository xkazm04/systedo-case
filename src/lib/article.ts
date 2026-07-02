import data from "@/data/article.json";
import { validateArticle } from "./article-validate";

/** A small "headless CMS" content model. The article is stored as structured
 *  JSON (src/data/article.json) and rendered by a typed renderer — so it counts
 *  as JSON persistence, keeps links first-class (internal / external / anchor),
 *  and lets us derive the table of contents and FAQ schema automatically. */

export type Inline =
  | string
  | { text: string; href: string; kind: "internal" | "external" | "anchor"; campaign?: string }
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
  /** optional UTM campaign for an external CTA, so content→shop clicks are attributable */
  campaign?: string;
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

/** Validate the hand-authored JSON against the Article model at load time, failing
 *  the BUILD (not the page) on a malformed entry. The guard itself lives in the
 *  framework-free `./article-validate` so the other Article producers (the
 *  snapshotToArticle bridge, AI drafts) run the exact same checks — an unknown
 *  block type, a figure missing src/alt, an empty FAQ (Google requires ≥1
 *  question for FAQPage), a dead `#anchor`, or a duplicate heading id would
 *  otherwise crash the renderer or silently emit invalid JSON-LD. */
export const article = validateArticle(data, "article.json");

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
