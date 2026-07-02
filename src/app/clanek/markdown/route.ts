import { article } from "@/lib/article";
import { articleToMarkdown } from "@/lib/article-markdown";
import { slugify } from "@/lib/nav";

/** The published article's Markdown twin — an `llms.txt`-era machine-readable
 *  form of the flagship content deliverable, served straight from the same
 *  validated singleton the page renders (so the two can never drift). Linked
 *  from the article's metadata via `rel="alternate" type="text/markdown"`;
 *  also the agency's content-handoff format with links preserved. */
export function GET(): Response {
  return new Response(articleToMarkdown(article), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename="${slugify(article.meta.title)}.md"`,
    },
  });
}
