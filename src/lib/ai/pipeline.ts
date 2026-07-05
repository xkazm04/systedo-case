/** Pure step-mappers for the one-click content pipeline (keywords → clusters →
 *  brief → article draft → channel distribution). The pairwise contracts already
 *  exist in ai-types; these helpers stitch them into a chain the wizard client
 *  can run over the existing /api/ai modes — no new server surface, no new
 *  prompts. Framework-free and unit-tested (test-unit/ai-pipeline.test.mjs). */

import type {
  ArticleDraftRequest,
  ArticleDraftResult,
  BriefKeyword,
  BriefRequest,
  BriefResult,
  ContentType,
  KeywordCluster,
  KeywordClusterInput,
  RepurposeRequest,
  Tone,
} from "../ai-types";
import { blockToMarkdown, faqToMarkdown, type MarkdownLabels } from "../article-markdown";

/** Server-side cap on the clustering input (validateKeywordClustersRequest). */
export const PIPELINE_KEYWORDS_MAX = 60;

/** Parse the wizard's keyword textarea — one keyword per line, an optional
 *  monthly volume after a semicolon („skladování ořechů; 720"). De-duped
 *  case-insensitively and capped like the server validator, so what the user
 *  sees leaving step 1 is exactly what the clustering tool receives. */
export function parseKeywordLines(text: string, max = PIPELINE_KEYWORDS_MAX): KeywordClusterInput[] {
  const seen = new Set<string>();
  const out: KeywordClusterInput[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [rawKeyword, rawVolume] = line.split(";");
    const keyword = (rawKeyword ?? "").trim().slice(0, 120);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const item: KeywordClusterInput = { keyword };
    const volume = Number((rawVolume ?? "").trim());
    if (Number.isFinite(volume) && volume > 0) item.volume = volume;
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** Step 2 mapping: the chosen cluster becomes the brief request. The cluster's
 *  pillar is the primary keyword, its topic the content topic, and every cluster
 *  keyword travels along as real grounding — volumes looked up from the step-1
 *  input so the brief tool sees actual demand, not model invention. */
export function clusterToBriefRequest(
  cluster: KeywordCluster,
  inputs: KeywordClusterInput[],
  opts: { audience: string; contentType?: ContentType }
): BriefRequest {
  const volumeByKeyword = new Map(inputs.map((k) => [k.keyword.toLowerCase(), k.volume ?? 0]));
  const keywords: BriefKeyword[] = [cluster.pillar, ...cluster.supporting]
    .filter(Boolean)
    .slice(0, 12)
    .map((keyword) => ({
      keyword,
      volume: volumeByKeyword.get(keyword.toLowerCase()) ?? 0,
      competition: "",
    }));
  return {
    topic: cluster.topic.trim().slice(0, 200) || cluster.pillar.slice(0, 200),
    primaryKeyword: cluster.pillar.trim().slice(0, 120),
    audience: opts.audience.trim().slice(0, 300),
    contentType: opts.contentType ?? "blog",
    keywords: keywords.length > 0 ? keywords : undefined,
  };
}

/** Step 3 mapping: the approved brief becomes the article-draft request — the
 *  same subset ArticleDraftPanel sends, plus the audience/content type the
 *  wizard already knows so the draft keeps the campaign's tone. */
export function briefToArticleDraftRequest(
  brief: BriefResult,
  opts?: { audience?: string; contentType?: ContentType }
): ArticleDraftRequest {
  const req: ArticleDraftRequest = {
    titleTag: brief.titleTag,
    metaDescription: brief.metaDescription,
    h1: brief.h1,
    slug: brief.slug,
    outline: brief.outline,
    faq: brief.faq,
    keywords: brief.keywords,
  };
  const audience = opts?.audience?.trim();
  if (audience) req.audience = audience.slice(0, 300);
  if (opts?.contentType) req.contentType = opts.contentType;
  return req;
}

/** The draft body as plain Markdown — grounding for the repurpose step and the
 *  wizard's .md export. Uses the shared Block serializer so links/bold survive.
 *  Unfilled figure placeholders (empty src) are skipped so the export never
 *  carries a broken `![alt]()`. */
export function draftBodyMarkdown(draft: ArticleDraftResult, labels?: MarkdownLabels): string {
  return draft.blocks
    .filter((b) => !(b.type === "figure" && !b.src))
    .map((b) => blockToMarkdown(b, labels))
    .filter(Boolean)
    .join("\n\n");
}

/** The whole draft (brief metadata + body + FAQ) as one Markdown document. */
export function draftToMarkdownDoc(
  brief: BriefResult,
  draft: ArticleDraftResult,
  labels?: MarkdownLabels
): string {
  const parts = [`# ${brief.h1 || brief.titleTag}`, ""];
  if (brief.metaDescription) parts.push(`_${brief.metaDescription}_`, "");
  const body = draftBodyMarkdown(draft, labels);
  if (body) parts.push(body, "");
  const faqMd = faqToMarkdown(draft.faq, labels);
  if (faqMd) parts.push(faqMd, "");
  return parts.join("\n").trimEnd() + "\n";
}

/** Step 4 mapping: the finished draft becomes the repurpose request. The URL is
 *  derived from the brief's slug under the site origin (the variants link back
 *  to where the article will live), the body is the serialized draft. */
export function draftToRepurposeRequest(args: {
  brief: BriefResult;
  draft: ArticleDraftResult;
  channels: string[];
  tone: Tone;
  /** site origin for the article URL, e.g. window.location.origin */
  origin: string;
}): RepurposeRequest {
  const { brief, draft, channels, tone, origin } = args;
  const slug = brief.slug.trim() || "clanek";
  const base = origin.replace(/\/+$/, "");
  return {
    title: (brief.h1 || brief.titleTag).slice(0, 300),
    url: `${base}/blog/${slug}`,
    body: draftBodyMarkdown(draft),
    channels,
    tone,
  };
}
