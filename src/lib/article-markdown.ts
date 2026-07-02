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

/** Inline runs with links preserved (`[text](href)`) and bold as `**text**`. */
export function inlineToMarkdown(content: Inline[]): string {
  return content
    .map((node) => {
      if (typeof node === "string") return node;
      if ("bold" in node) return `**${node.text}**`;
      return `[${node.text}](${node.href})`;
    })
    .join("");
}

/** One Block as a Markdown fragment (no trailing newline). The switch is
 *  exhaustive over the Block union, so adding a block type to the model won't
 *  compile until it learns to serialize itself. */
export function blockToMarkdown(block: Block, labels: MarkdownLabels = CS_MARKDOWN_LABELS): string {
  switch (block.type) {
    case "h2":
      return `## ${block.text}`;
    case "h3":
      return `### ${block.text}`;
    case "p":
      return inlineToMarkdown(block.content);
    case "ul":
      return block.items.map((it) => `- ${inlineToMarkdown(it)}`).join("\n");
    case "ol":
      return block.items.map((it, i) => `${i + 1}. ${inlineToMarkdown(it)}`).join("\n");
    case "callout":
      return [`> **${block.title ?? labels.calloutTitle}**`, `> ${inlineToMarkdown(block.content)}`].join("\n");
    case "quote": {
      const quote = `> ${inlineToMarkdown(block.content)}`;
      return block.cite ? `${quote}\n> — ${block.cite}` : quote;
    }
    case "cta":
      return `> **${block.text}** — [${block.cta}](${block.href})`;
    case "stat":
      return block.items.map((s) => `- **${s.value}** — ${s.label}`).join("\n");
    case "figure": {
      const img = `![${block.alt}](${block.src})`;
      return block.caption ? `${img}\n*${block.caption}*` : img;
    }
    case "table": {
      const head = `| ${block.header.map(escapeCell).join(" | ")} |`;
      const divider = `| ${block.header.map(() => "---").join(" | ")} |`;
      const body = block.rows.map(
        (row) => `| ${row.map((cell) => escapeCell(inlineToMarkdown(cell))).join(" | ")} |`
      );
      const table = [head, divider, ...body].join("\n");
      return block.caption ? `${table}\n*${block.caption}*` : table;
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
export function faqToMarkdown(faq: FaqItem[], labels: MarkdownLabels = CS_MARKDOWN_LABELS): string {
  if (faq.length === 0) return "";
  const lines = [`## ${labels.faqHeading}`, ""];
  for (const f of faq) lines.push(`**${f.q}**`, "", inlineToMarkdown(f.a), "");
  return lines.join("\n").trimEnd();
}

/** The whole article as one portable Markdown document: front matter, H1 +
 *  perex, every block, and the FAQ section. Lossless for links and bold —
 *  the payoff of the typed block model over scraped HTML. */
export function articleToMarkdown(a: Article, labels: MarkdownLabels = CS_MARKDOWN_LABELS): string {
  const parts = [articleFrontMatter(a.meta), "", `# ${a.meta.title}`, "", `_${a.meta.perex}_`, ""];
  for (const block of a.blocks) {
    const md = blockToMarkdown(block, labels);
    if (md) parts.push(md, "");
  }
  const faqMd = faqToMarkdown(a.faq, labels);
  if (faqMd) parts.push(faqMd, "");
  return parts.join("\n").trimEnd() + "\n";
}
