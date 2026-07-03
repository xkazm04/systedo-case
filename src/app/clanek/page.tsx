import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import ArticleBody from "@/components/article/ArticleBody";
import ArticleToc from "@/components/article/ArticleToc";
import MobileToc from "@/components/article/MobileToc";
import Breadcrumbs from "@/components/article/Breadcrumbs";
import ReadingProgress from "@/components/article/ReadingProgress";
import ShareBar from "@/components/article/ShareBar";
import AuthorBio from "@/components/article/AuthorBio";
import CopyMarkdownButton from "@/components/article/CopyMarkdownButton";
import FaqHashOpen from "@/components/article/FaqHashOpen";
import FaqPermalink from "@/components/article/FaqPermalink";
import TaskPager from "@/components/site/TaskPager";
import { Clock } from "@/components/icons";
import { article, figureBlocks, inlineToText, tableOfContents } from "@/lib/article";
import { faqItemId } from "@/lib/article-validate";
import { articleToMarkdown } from "@/lib/article-markdown";
import { fmtDate } from "@/lib/format";
import { categoryHubPath, navLabel, type Crumb } from "@/lib/nav";
import { canonical, SITE_NAME } from "@/lib/site";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  cs: {
    eyebrow: "Úkol 2 · Článek pro mionelo.cz",
    updated: "Aktualizováno",
    readingTime: "{n} min čtení",
    tocSidebar: "Obsah článku",
    faqHeading: "Časté dotazy",
    breadcrumbHome: "Domů",
    breadcrumbArticle: "Článek",
  },
  en: {
    eyebrow: "Task 2 · Article for mionelo.cz",
    updated: "Updated",
    readingTime: "{n} min read",
    tocSidebar: "Table of contents",
    faqHeading: "Frequently asked questions",
    breadcrumbHome: "Home",
    breadcrumbArticle: "Article",
  },
} as const;

const { meta, blocks, faq } = article;

const ARTICLE_PATH = "/clanek";
const articleUrl = canonical(ARTICLE_PATH);

// Figure blocks are promoted into the JSON-LD graph: each becomes an ImageObject
// node and the Article references them via `image`, making them eligible for
// Google image rich results without any extra authoring.
const figures = figureBlocks(article);

// The article's Markdown twin, serialized once at module scope from the same
// validated singleton the page renders. Fed to the copy-for-AI button below and
// served as a document by GET /clanek/markdown.
const articleMarkdown = articleToMarkdown(article);

// breadcrumbs are built inside the async page function so labels are translatable.

export const metadata: Metadata = {
  title: meta.title,
  description: meta.perex,
  alternates: {
    canonical: ARTICLE_PATH,
    // machine-readable twin for AI crawlers / answer engines
    types: { "text/markdown": `${ARTICLE_PATH}/markdown` },
  },
  openGraph: { title: meta.title, description: meta.perex, type: "article", url: articleUrl },
};

// Author modelled as a Person (name / role / bio) for E-E-A-T credibility,
// with optional fields included only when present.
const author: Record<string, string> = {
  "@type": "Person",
  name: meta.author,
  jobTitle: meta.role,
};
if (meta.authorBio) author.description = meta.authorBio;
if (meta.authorUrl) author.url = meta.authorUrl;

export default async function ArticlePage() {
  const t = await getT(T);
  const toc = tableOfContents(article);

  // Breadcrumb trail (Home › Article › category › title), reused for both the
  // visible <Breadcrumbs> and the BreadcrumbList JSON-LD so they never drift.
  const breadcrumbs: Crumb[] = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: navLabel(ARTICLE_PATH, t("breadcrumbArticle"), await getServerLocale()), href: ARTICLE_PATH },
    { label: meta.category, href: categoryHubPath() },
    { label: meta.title },
  ];

  // Structured data: Article (+ author Person, figure ImageObjects) +
  // BreadcrumbList + FAQPage, so the page is rich-result ready.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: meta.title,
        description: meta.perex,
        author,
        datePublished: meta.dateISO,
        dateModified: meta.dateModifiedISO ?? meta.dateISO,
        articleSection: meta.category,
        keywords: meta.tags.join(", "),
        // The remaining fields Google's Article guidance leans on: the page
        // this Article is the main entity of, the content language (the
        // article body is Czech regardless of the UI locale), and the
        // publishing Organization — all from the shared site constants so
        // they can't drift from the rest of the app.
        mainEntityOfPage: articleUrl,
        url: articleUrl,
        inLanguage: "cs",
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: canonical("/"),
          logo: { "@type": "ImageObject", url: canonical("/icon.svg") },
        },
        ...(figures.length ? { image: figures.map((f) => canonical(f.src)) } : {}),
      },
      // One ImageObject per figure — gives each article image its own node with an
      // absolute contentUrl, caption and intrinsic dimensions for rich results.
      ...figures.map((f) => ({
        "@type": "ImageObject",
        url: canonical(f.src),
        contentUrl: canonical(f.src),
        description: f.alt,
        ...(f.caption ? { caption: f.caption } : {}),
        ...(f.width ? { width: f.width } : {}),
        ...(f.height ? { height: f.height } : {}),
      })),
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((crumb, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: crumb.label,
          // The trailing crumb (current article) has no href, so it resolves to
          // the article's own canonical URL.
          item: canonical(crumb.href ?? ARTICLE_PATH),
        })),
      },
      {
        "@type": "FAQPage",
        // Each Question carries its deep link, so a FAQ rich result can land the
        // user on the exact answer (FaqHashOpen then auto-opens the accordion).
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          url: `${articleUrl}#${faqItemId(f)}`,
          acceptedAnswer: { "@type": "Answer", text: inlineToText(f.a) },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReadingProgress readingMinutes={meta.readingMinutes} />

      {/* article header */}
      <section className="border-b border-line bg-surface">
        <Container className="max-w-3xl py-12 sm:py-16">
          <Breadcrumbs items={breadcrumbs} />
          <div className="mt-6">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Pill tone="brand">{meta.category}</Pill>
            <span>·</span>
            <time dateTime={meta.dateISO}>{fmtDate(meta.dateISO)}</time>
            {meta.dateModifiedISO && meta.dateModifiedISO !== meta.dateISO && (
              <>
                <span>·</span>
                <time
                  dateTime={meta.dateModifiedISO}
                  className="inline-flex items-center gap-1 text-brand-700"
                  title={`${t("updated")} ${fmtDate(meta.dateModifiedISO)}`}
                >
                  <Clock width={13} height={13} aria-hidden />
                  {t("updated")} {fmtDate(meta.dateModifiedISO)}
                </time>
              </>
            )}
            <span>·</span>
            <span>{t("readingTime", { n: meta.readingMinutes })}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-navy-800 sm:text-[2.6rem] sm:leading-[1.12]">
            {meta.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">{meta.perex}</p>
          <AuthorBio
            name={meta.author}
            role={meta.role}
            credential={meta.authorCredential}
            bio={meta.authorBio}
            url={meta.authorUrl}
          />
          <div className="mt-4 flex items-center justify-end gap-1.5">
            <CopyMarkdownButton markdown={articleMarkdown} />
            <ShareBar url={articleUrl} title={meta.title} />
          </div>
        </Container>
      </section>

      {/* body + sticky TOC (desktop rail) / collapsible TOC island (mobile) */}
      <Container className="grid gap-10 py-12 lg:grid-cols-[220px_1fr] lg:gap-14">
        <MobileToc items={toc} />
        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {t("tocSidebar")}
              </p>
              <ArticleToc items={toc} />
            </div>
          </aside>
        )}

        <article className="min-w-0 max-w-2xl">
          <ArticleBody blocks={blocks} />

          {/* tags */}
          <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
            {meta.tags.map((tag) => (
              <span key={tag} className="rounded-pill bg-navy-50 px-3 py-1.5 text-xs font-medium text-muted">
                #{tag}
              </span>
            ))}
          </div>

          {/* FAQ */}
          <section className="mt-12" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-navy-800">
              {t("faqHeading")}
            </h2>
            {/* Auto-open + scroll to the question a #hash targets — a deep link
                into a collapsed accordion is useless without it. */}
            <FaqHashOpen ids={faq.map(faqItemId)} />
            <div className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {faq.map((f) => {
                const id = faqItemId(f);
                return (
                <details key={id} id={id} className="group scroll-mt-24 px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center gap-2 font-medium text-navy-800">
                    <span className="flex-1">{f.q}</span>
                    <FaqPermalink id={id} question={f.q} />
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
                    {f.a.map((node, j) =>
                      typeof node === "string" ? (
                        <span key={j}>{node}</span>
                      ) : "bold" in node ? (
                        <strong key={j}>{node.text}</strong>
                      ) : (
                        <a
                          key={j}
                          href={node.href}
                          target={node.kind === "external" ? "_blank" : undefined}
                          rel={node.kind === "external" ? "noopener noreferrer" : undefined}
                          className="link-inline"
                        >
                          {node.text}
                        </a>
                      )
                    )}
                  </p>
                </details>
                );
              })}
            </div>
          </section>

          {/* prev/next pager — walks the reviewer through the case study in
              task order, replacing the bespoke "continue reading" cards */}
          <TaskPager current="/clanek" />
        </article>
      </Container>
    </>
  );
}
