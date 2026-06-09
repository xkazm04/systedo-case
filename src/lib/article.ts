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

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CalloutBlock
  | QuoteBlock
  | CtaBlock
  | StatBlock;

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
    dateISO: string;
    readingMinutes: number;
    category: string;
    tags: string[];
  };
  blocks: Block[];
  faq: FaqItem[];
}

export const article = data as Article;

/** Plain-text helper for the FAQ JSON-LD (strips link/bold wrappers). */
export function inlineToText(content: Inline[]): string {
  return content
    .map((node) => (typeof node === "string" ? node : node.text))
    .join("");
}

/** Table of contents derived from the H2 headings. */
export function tableOfContents(a: Article): { id: string; text: string }[] {
  return a.blocks
    .filter((b): b is HeadingBlock => b.type === "h2")
    .map((b) => ({ id: b.id, text: b.text }));
}
