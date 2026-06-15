import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import ArticleBody from "@/components/article/ArticleBody";
import ArticleToc from "@/components/article/ArticleToc";
import Breadcrumbs from "@/components/article/Breadcrumbs";
import ReadingProgress from "@/components/article/ReadingProgress";
import ShareBar from "@/components/article/ShareBar";
import TaskPager from "@/components/site/TaskPager";
import { Document } from "@/components/icons";
import { article, figureBlocks, inlineToText, tableOfContents } from "@/lib/article";
import { fmtDate } from "@/lib/format";
import { categoryHubPath, navLabel, type Crumb } from "@/lib/nav";
import { canonical } from "@/lib/site";

const { meta, blocks, faq } = article;

const ARTICLE_PATH = "/clanek";
const articleUrl = canonical(ARTICLE_PATH);

// Figure blocks are promoted into the JSON-LD graph: each becomes an ImageObject
// node and the Article references them via `image`, making them eligible for
// Google image rich results without any extra authoring.
const figures = figureBlocks(article);

// Breadcrumb trail (Domů › Článek › category › title), reused for both the
// visible <Breadcrumbs> and the BreadcrumbList JSON-LD so they never drift.
const breadcrumbs: Crumb[] = [
  { label: "Domů", href: "/" },
  { label: navLabel(ARTICLE_PATH, "Článek"), href: ARTICLE_PATH },
  { label: meta.category, href: categoryHubPath() },
  { label: meta.title },
];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.perex,
  alternates: { canonical: ARTICLE_PATH },
  openGraph: { title: meta.title, description: meta.perex, type: "article", url: articleUrl },
};

// Structured data: Article + BreadcrumbList + FAQPage, so the page is
// rich-result ready (breadcrumb trail included as a SERP rich snippet).
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: meta.title,
      description: meta.perex,
      author: { "@type": "Organization", name: meta.author },
      datePublished: meta.dateISO,
      articleSection: meta.category,
      keywords: meta.tags.join(", "),
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
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: inlineToText(f.a) },
      })),
    },
  ],
};

export default function ArticlePage() {
  const toc = tableOfContents(article);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReadingProgress />

      {/* article header */}
      <section className="border-b border-line bg-surface">
        <Container className="max-w-3xl py-12 sm:py-16">
          <Breadcrumbs items={breadcrumbs} />
          <div className="mt-6">
            <Eyebrow>Úkol 2 · Článek pro mionelo.cz</Eyebrow>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Pill tone="brand">{meta.category}</Pill>
            <span>·</span>
            <span>{fmtDate(meta.dateISO)}</span>
            <span>·</span>
            <span>{meta.readingMinutes} min čtení</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-navy-800 sm:text-[2.6rem] sm:leading-[1.12]">
            {meta.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">{meta.perex}</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-onyx text-brand-400">
                <Document width={18} height={18} />
              </span>
              <div className="text-sm">
                <p className="font-semibold text-navy-800">{meta.author}</p>
                <p className="text-muted">{meta.role}</p>
              </div>
            </div>
            <ShareBar url={articleUrl} title={meta.title} />
          </div>
        </Container>
      </section>

      {/* body + sticky TOC */}
      <Container className="grid gap-10 py-12 lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Obsah článku
            </p>
            <ArticleToc items={toc} />
          </div>
        </aside>

        <article className="min-w-0 max-w-2xl">
          <ArticleBody blocks={blocks} />

          {/* tags */}
          <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
            {meta.tags.map((t) => (
              <span key={t} className="rounded-pill bg-navy-50 px-3 py-1.5 text-xs font-medium text-muted">
                #{t}
              </span>
            ))}
          </div>

          {/* FAQ */}
          <section className="mt-12" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight text-navy-800">
              Časté dotazy
            </h2>
            <div className="mt-5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {faq.map((f, i) => (
                <details key={i} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-navy-800">
                    {f.q}
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
              ))}
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
