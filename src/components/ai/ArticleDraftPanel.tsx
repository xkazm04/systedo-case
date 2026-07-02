"use client";

import { useState } from "react";
import { Bolt, Document, Download } from "@/components/icons";
import ArticleBody from "@/components/article/ArticleBody";
import { downloadText } from "@/lib/export";
import { useT } from "@/lib/i18n/client";
import { inlineToText, type Article, type Block, type FaqItem } from "@/lib/article";
import type { ArticleDraftRequest, ArticleDraftResult, BriefResult } from "@/lib/ai-types";
import { useAiTool } from "./useAiTool";
import { LoadingTimer, PromptDisclosure, ResultMeta, TimeoutState, ToolError } from "./primitives";

const T = {
  cs: {
    panelHeading: "Rozepsat článek",
    panelBody: "Z hotového briefu připravíme koncept článku — odstavce, nadpisy, seznamy, tip i závěrečnou výzvu — ve stejné struktuře jako publikovaný článek.",
    regenerate: "Vygenerovat znovu",
    generate: "Rozepsat článek",
    previewTab: "Náhled",
    jsonTab: "Article JSON",
    downloadMdTitle: "Stáhnout koncept jako Markdown",
    downloadMd: "Stáhnout .md",
    downloadJsonTitle: "Stáhnout koncept jako Article JSON",
    downloadJson: "Stáhnout .json",
    faqHeading: "Časté dotazy",
    articleAuthor: "Systedo · obsahový tým",
    articleRole: "Koncept článku z AI briefu",
    articleCategory: "Koncept",
    mdFaqHeading: "## Časté dotazy (FAQ)",
    calloutTip: "Tip",
  },
  en: {
    panelHeading: "Expand to article",
    panelBody: "From the finished brief we will prepare an article draft — paragraphs, headings, lists, a tip and a closing CTA — in the same structure as a published article.",
    regenerate: "Regenerate",
    generate: "Expand to article",
    previewTab: "Preview",
    jsonTab: "Article JSON",
    downloadMdTitle: "Download draft as Markdown",
    downloadMd: "Download .md",
    downloadJsonTitle: "Download draft as Article JSON",
    downloadJson: "Download .json",
    faqHeading: "Frequently asked questions",
    articleAuthor: "Systedo · content team",
    articleRole: "Article draft from AI brief",
    articleCategory: "Draft",
    mdFaqHeading: "## Frequently asked questions (FAQ)",
    calloutTip: "Tip",
  },
} as const;

/** Serialize one Block into a Markdown fragment. Keeps the same subset the draft
 *  tool produces (p / h2 / h3 / ul / ol / callout / cta); links/bold inside an
 *  Inline[] collapse to plain text via inlineToText. */
function blockToMarkdown(block: Block, tipLabel: string): string {
  switch (block.type) {
    case "h2":
      return `## ${block.text}`;
    case "h3":
      return `### ${block.text}`;
    case "p":
      return inlineToText(block.content);
    case "ul":
      return block.items.map((it) => `- ${inlineToText(it)}`).join("\n");
    case "ol":
      return block.items.map((it, i) => `${i + 1}. ${inlineToText(it)}`).join("\n");
    case "callout":
      return [`> **${block.title ?? tipLabel}**`, `> ${inlineToText(block.content)}`].join("\n");
    case "cta":
      return `> **${block.text}** — [${block.cta}](${block.href})`;
    case "quote":
      return `> ${inlineToText(block.content)}`;
    case "stat":
      return block.items.map((s) => `- **${s.value}** — ${s.label}`).join("\n");
    case "figure":
      return `![${block.alt}](${block.src})`;
    default:
      return "";
  }
}

/** Build the full draft Markdown document from the brief metadata + draft body. */
function draftToMarkdown(brief: BriefResult, draft: ArticleDraftResult, tipLabel: string, faqHeading: string): string {
  const lines: string[] = [`# ${brief.h1 || brief.titleTag}`, ""];
  if (brief.metaDescription) lines.push(`_${brief.metaDescription}_`, "");
  for (const block of draft.blocks) {
    const md = blockToMarkdown(block, tipLabel);
    if (md) lines.push(md, "");
  }
  if (draft.faq.length > 0) {
    lines.push(faqHeading, "");
    for (const f of draft.faq) lines.push(`**${f.q}**`, "", inlineToText(f.a), "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Assemble a publish-ready Article (same shape as src/data/article.json) so the
 *  draft can be exported as the app's headless content JSON. */
function draftToArticle(brief: BriefResult, draft: ArticleDraftResult, author: string, role: string, category: string): Article {
  return {
    meta: {
      title: brief.h1 || brief.titleTag,
      perex: brief.metaDescription,
      author,
      role,
      dateISO: new Date().toISOString().slice(0, 10),
      readingMinutes: Math.max(1, Math.round(draft.blocks.length / 3)),
      category,
      tags: brief.keywords.slice(0, 6),
    },
    blocks: draft.blocks,
    faq: draft.faq,
  };
}

/** Inline FAQ list, mirroring the /clanek FAQ accordion styling. */
function DraftFaq({ faq, heading }: { faq: FaqItem[]; heading: string }) {
  if (faq.length === 0) return null;
  return (
    <section className="mt-10" aria-labelledby="draft-faq-heading">
      <h2 id="draft-faq-heading" className="text-xl font-semibold tracking-tight text-navy-800">
        {heading}
      </h2>
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {faq.map((f, i) => (
          <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-navy-800">
              {f.q}
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">{inlineToText(f.a)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** "Expand to article" — turns a finished brief into a near-publishable draft as the
 *  app's typed Block[] + FAQ, rendered through the same ArticleBody as /clanek and
 *  exportable as Markdown or article JSON. */
export default function ArticleDraftPanel({ brief }: { brief: BriefResult }) {
  const t = useT(T);
  const { status, data, error, errorInfo, timedOut, run, reset } = useAiTool<ArticleDraftResult>("article-draft");
  const [preview, setPreview] = useState<"preview" | "json">("preview");

  function onGenerate() {
    const payload: ArticleDraftRequest = {
      titleTag: brief.titleTag,
      metaDescription: brief.metaDescription,
      h1: brief.h1,
      slug: brief.slug,
      outline: brief.outline,
      faq: brief.faq,
      keywords: brief.keywords,
    };
    run(payload as unknown as Record<string, unknown>);
  }

  const draft = data?.result;
  const slug = brief.slug || "clanek";

  const exportMarkdown = () => {
    if (!draft) return;
    downloadText(
      `systedo-clanek-${slug}.md`,
      draftToMarkdown(brief, draft, t("calloutTip"), t("mdFaqHeading")),
      "text/markdown;charset=utf-8"
    );
  };

  const exportJson = () => {
    if (!draft) return;
    downloadText(
      `systedo-clanek-${slug}.json`,
      JSON.stringify(draftToArticle(brief, draft, t("articleAuthor"), t("articleRole"), t("articleCategory")), null, 2),
      "application/json;charset=utf-8"
    );
  };

  return (
    <div className="card space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-800">{t("panelHeading")}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {t("panelBody")}
          </p>
        </div>
        {status !== "loading" && (
          <button
            type="button"
            onClick={status === "done" ? reset : onGenerate}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-onyx px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            {status === "done" ? (
              <>
                <Document width={16} height={16} />
                {t("regenerate")}
              </>
            ) : (
              <>
                <Bolt width={16} height={16} />
                {t("generate")}
              </>
            )}
          </button>
        )}
      </div>

      {status === "loading" && <LoadingTimer />}
      {status === "error" &&
        (timedOut ? (
          <TimeoutState onRetry={reset} />
        ) : (
          <ToolError message={error ?? ""} onRetry={reset} upgradeUrl={errorInfo?.upgradeUrl} retryAfter={errorInfo?.retryAfter} />
        ))}

      {status === "done" && draft && data && (
        <div className="animate-fade-up space-y-5">
          <ResultMeta meta={data.meta} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-pill border border-line p-0.5 text-xs font-medium">
              {(["preview", "json"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPreview(v)}
                  aria-pressed={preview === v}
                  className={`rounded-pill px-3 py-1 transition-colors ${
                    preview === v ? "bg-onyx text-white" : "text-muted hover:text-navy-700"
                  }`}
                >
                  {v === "preview" ? t("previewTab") : t("jsonTab")}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportMarkdown}
                title={t("downloadMdTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadMd")}
              </button>
              <button
                type="button"
                onClick={exportJson}
                title={t("downloadJsonTitle")}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                {t("downloadJson")}
              </button>
            </div>
          </div>

          {preview === "preview" ? (
            <article className="min-w-0 max-w-2xl rounded-card border border-line bg-surface p-6 sm:p-8">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-navy-800 sm:text-3xl">
                {brief.h1 || brief.titleTag}
              </h1>
              {brief.metaDescription && (
                <p className="mt-3 text-lg leading-relaxed text-muted">{brief.metaDescription}</p>
              )}
              <div className="mt-8">
                <ArticleBody blocks={draft.blocks} />
              </div>
              <DraftFaq faq={draft.faq} heading={t("faqHeading")} />
            </article>
          ) : (
            <pre className="max-h-[32rem] overflow-auto rounded-card border border-line bg-onyx px-5 py-4 font-mono text-xs leading-relaxed text-onyx-ink">
              {JSON.stringify(draftToArticle(brief, draft, t("articleAuthor"), t("articleRole"), t("articleCategory")), null, 2)}
            </pre>
          )}

          <PromptDisclosure prompt={data.meta.prompt} />
        </div>
      )}
    </div>
  );
}
