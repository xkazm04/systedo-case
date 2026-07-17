/** Block→Markdown serializer for the headless Article model — the single
 *  implementation behind every Markdown surface: the published article's
 *  machine-readable twin (`GET /clanek/markdown` + the „Markdown" copy button
 *  beside the ShareBar) and the AI draft panel's `.md` export. Hoisted out of
 *  the `"use client"` panel so it is pure, framework-free (type-only imports)
 *  and — unlike the old panel-private version — keeps links first-class as
 *  `[text](href)` instead of collapsing them to plain text.
 *  Unit-tested in `test-unit/article-markdown.test.mjs`, where the
 *  `BLOCK_TYPES` registry doubles as the serializer's coverage checklist. */
import type { Article, Block, FaqItem, Inline } from "./article";

/** The few locale-dependent strings the serializer needs; callers with a
 *  translator (the AI draft panel) pass their own, server surfaces use the
 *  Czech defaults matching the article content's language. */
export interface MarkdownLabels {
  /** bold lead of a callout blockquote when the block carries no title */
  calloutTitle: string;
  /** heading of the trailing FAQ section */
  faqHeading: string;
}

export const CS_MARKDOWN_LABELS: MarkdownLabels = {
  calloutTitle: "Tip",
  faqHeading: "Časté dotazy (FAQ)",
};

/** Backslash-escape the Markdown metacharacters that would otherwise turn a
 *  plain text run into unintended emphasis / a heading / a link on the portable
 *  twin. The typed block model guarantees Markdown-*structure* but not
 *  Markdown-*safe text* — client names, segments and future AI drafts can carry
 *  any of these. */
export function escapeMd(s: string): string {
  return s.replace(/[\\`*_[\]<>#]/g, "\\$&");
}

/** Prepare an href for `[text](href)`: absolutize a site-relative path against
 *  `baseUrl` when given (so images/links survive leaving the site), and
 *  percent-encode the parens that would otherwise break the link syntax. */
export function mdHref(href: string, baseUrl?: string): string {
  const abs = baseUrl && href.startsWith("/") ? `${baseUrl.replace(/\/+$/, "")}${href}` : href;
  return abs.replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/** Inline runs with links preserved (`[text](href)`) and bold as `**text**`.
 *  Text runs and link text are metachar-escaped; hrefs are prepared via
 *  {@link mdHref} (optionally absolutized against `baseUrl`). */
export function inlineToMarkdown(content: Inline[], baseUrl?: string): string {
  return content
    .map((node) => {
      if (typeof node === "string") return escapeMd(node);
      if ("bold" in node) return `**${escapeMd(node.text)}**`;
      return `[${escapeMd(node.text)}](${mdHref(node.href, baseUrl)})`;
    })
    .join("");
}

/** One Block as a Markdown fragment (no trailing newline). The switch is
 *  exhaustive over the Block union, so adding a block type to the model won't
 *  compile until it learns to serialize itself. */
export function blockToMarkdown(
  block: Block,
  labels: MarkdownLabels = CS_MARKDOWN_LABELS,
  baseUrl?: string
): string {
  switch (block.type) {
    case "h2":
      return `## ${escapeMd(block.text)}`;
    case "h3":
      return `### ${escapeMd(block.text)}`;
    case "p":
      return inlineToMarkdown(block.content, baseUrl);
    case "ul":
      return block.items.map((it) => `- ${inlineToMarkdown(it, baseUrl)}`).join("\n");
    case "ol":
      return block.items.map((it, i) => `${i + 1}. ${inlineToMarkdown(it, baseUrl)}`).join("\n");
    case "callout":
      return [`> **${escapeMd(block.title ?? labels.calloutTitle)}**`, `> ${inlineToMarkdown(block.content, baseUrl)}`].join("\n");
    case "quote": {
      const quote = `> ${inlineToMarkdown(block.content, baseUrl)}`;
      return block.cite ? `${quote}\n> — ${escapeMd(block.cite)}` : quote;
    }
    case "cta":
      return `> **${escapeMd(block.text)}** — [${escapeMd(block.cta)}](${mdHref(block.href, baseUrl)})`;
    case "stat":
      return block.items.map((s) => `- **${escapeMd(s.value)}** — ${escapeMd(s.label)}`).join("\n");
    case "figure": {
      const img = `![${escapeMd(block.alt)}](${mdHref(block.src, baseUrl)})`;
      return block.caption ? `${img}\n*${escapeMd(block.caption)}*` : img;
    }
    case "table": {
      const head = `| ${block.header.map((h) => escapeCell(escapeMd(h))).join(" | ")} |`;
      const divider = `| ${block.header.map(() => "---").join(" | ")} |`;
      const body = block.rows.map(
        (row) => `| ${row.map((cell) => escapeCell(inlineToMarkdown(cell, baseUrl))).join(" | ")} |`
      );
      const table = [head, divider, ...body].join("\n");
      return block.caption ? `${table}\n*${escapeMd(block.caption)}*` : table;
    }
  }
}

/** Escape the cell delimiter so content can't break a Markdown table row. */
const escapeCell = (s: string): string => s.replace(/\|/g, "\\|");

/** Double-quoted YAML scalar (titles/perex routinely contain `:` and quotes). */
const yamlQuote = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** YAML front matter from the article meta — the fields an AI crawler or a
 *  static-site pipeline actually consumes. */
export function articleFrontMatter(meta: Article["meta"]): string {
  return [
    "---",
    `title: ${yamlQuote(meta.title)}`,
    `description: ${yamlQuote(meta.perex)}`,
    `author: ${yamlQuote(meta.author)}`,
    `date: ${meta.dateISO}`,
    ...(meta.dateModifiedISO ? [`lastmod: ${meta.dateModifiedISO}`] : []),
    `category: ${yamlQuote(meta.category)}`,
    `tags: [${meta.tags.map(yamlQuote).join(", ")}]`,
    `readingMinutes: ${meta.readingMinutes}`,
    "---",
  ].join("\n");
}

/** The FAQ as a trailing Markdown section (empty string when there is none). */
export function faqToMarkdown(
  faq: FaqItem[],
  labels: MarkdownLabels = CS_MARKDOWN_LABELS,
  baseUrl?: string
): string {
  if (faq.length === 0) return "";
  const lines = [`## ${labels.faqHeading}`, ""];
  for (const f of faq) lines.push(`**${escapeMd(f.q)}**`, "", inlineToMarkdown(f.a, baseUrl), "");
  return lines.join("\n").trimEnd();
}

/** The whole article as one portable Markdown document: front matter, H1 +
 *  perex, every block, and the FAQ section. Lossless for links and bold —
 *  the payoff of the typed block model over scraped HTML. Content metachars are
 *  escaped so the text can't inject Markdown; pass `baseUrl` to absolutize
 *  site-relative image/link hrefs for audiences off the site (AI crawlers,
 *  `.md` exports). */
export function articleToMarkdown(
  a: Article,
  labels: MarkdownLabels = CS_MARKDOWN_LABELS,
  baseUrl?: string
): string {
  const parts = [articleFrontMatter(a.meta), "", `# ${escapeMd(a.meta.title)}`, "", `_${escapeMd(a.meta.perex)}_`, ""];
  for (const block of a.blocks) {
    const md = blockToMarkdown(block, labels, baseUrl);
    if (md) parts.push(md, "");
  }
  const faqMd = faqToMarkdown(a.faq, labels, baseUrl);
  if (faqMd) parts.push(faqMd, "");
  return parts.join("\n").trimEnd() + "\n";
}
