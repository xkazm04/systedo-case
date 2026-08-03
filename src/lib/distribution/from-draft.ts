/** Turn a finished article draft into a Distribuce source — the missing in-app
 *  path from "I just wrote an article" to "give me the channel variants".
 *
 *  Distribuce could only ever distribute SAMPLE_SOURCE, one hardcoded fixture; a
 *  user who had just produced a draft in ArticleDraftPanel had no route into the
 *  module at all (that panel carried zero references to repurpose/distribuce), and
 *  the 4-step ContentPipeline chained internally with output that could not be
 *  reopened. This module is the conversion half of that bridge; the transport is
 *  the variants store's project_state seam, not a second mechanism.
 *
 *  Pure and framework-free — Block/Inline are plain types — so the conversion is
 *  unit-testable and safe to import from a client component. */
import { inlineToText, type Block } from "@/lib/article";
import { slugify } from "@/lib/nav";
import type { SourceArticle } from "./sample";

/** Placeholder host for a draft that has no published home yet. Matches the
 *  catalog ad-copy exporter's fallback, so the whole app tells one story about
 *  "we don't know your domain yet" instead of inventing a different fake each
 *  time. */
export const DRAFT_FALLBACK_HOST = "www.example.com";

/** Strip a domain the user typed as a URL down to a bare host. */
function hostOf(domain: string | undefined): string {
  const raw = (domain ?? "").trim();
  if (!raw) return DRAFT_FALLBACK_HOST;
  const stripped = raw.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
  return stripped || DRAFT_FALLBACK_HOST;
}

/** The URL a draft's channel links point at: the project's own domain when it has
 *  one, else the shared placeholder host. Always absolute and parseable, because
 *  the UTM stamper builds a `new URL()` from it and a malformed value would break
 *  every variant link. */
export function draftArticleUrl(domain: string | undefined, title: string): string {
  return `https://${hostOf(domain)}/${slugify(title) || "clanek"}`;
}

/** The draft body as plain prose, in reading order.
 *
 *  Plain text (not the Markdown export) on purpose: this string is what the
 *  repurpose tool digests, and `##`/`**` markers would be repurposed as content.
 *  Structural-only blocks (figures, stats, tables) are skipped — an image caption
 *  is not something to turn into a LinkedIn post. */
export function draftPlainText(blocks: readonly Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "h2":
      case "h3":
        parts.push(b.text);
        break;
      case "p":
      case "quote":
        parts.push(inlineToText(b.content));
        break;
      case "callout":
        parts.push([b.title, inlineToText(b.content)].filter(Boolean).join(": "));
        break;
      case "ul":
      case "ol":
        parts.push(b.items.map((i) => `- ${inlineToText(i)}`).join("\n"));
        break;
      case "cta":
        parts.push(b.text);
        break;
      default:
        // figure / stat / table — layout, not prose.
        break;
    }
  }
  return parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
}

/** Compose the SourceArticle a draft hands to Distribuce. The body is what makes
 *  the handoff worth anything: without it the repurpose tool can only work from
 *  the headline (BM-L1-04), and the AI path's backfill honesty flags would report
 *  a full backfill for content the user actually wrote. */
export function articleSourceFromDraft(input: {
  title: string;
  blocks: readonly Block[];
  domain?: string;
}): SourceArticle {
  const title = input.title.trim();
  const body = draftPlainText(input.blocks);
  return {
    title,
    url: draftArticleUrl(input.domain, title),
    ...(body ? { body } : {}),
  };
}
