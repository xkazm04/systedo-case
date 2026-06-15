import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import ArticleBody from "@/components/article/ArticleBody";
import ArticleToc from "@/components/article/ArticleToc";
import Breadcrumbs from "@/components/article/Breadcrumbs";
import { Gauge } from "@/components/icons";
import { performance } from "@/lib/data";
import { buildMetricsSnapshot } from "@/lib/metrics";
import { snapshotToArticle } from "@/lib/snapshot-to-article";
import { inlineToText, tableOfContents } from "@/lib/article";
import { fmtDate } from "@/lib/format";
import { canonical } from "@/lib/site";
import { navLabel, type Crumb } from "@/lib/nav";

/** Auto-generated data-story report: the dashboard snapshot rendered through the
 *  same headless-article model + JSON-LD pipeline as the hand-authored article. */
const REPORT_PATH = "/clanek/vykon";
const reportUrl = canonical(REPORT_PATH);

const snapshot = buildMetricsSnapshot(performance, { key: "90d", label: "90 dní", days: 90 });
const article = snapshotToArticle(
  snapshot,
  { name: performance.client.name, segment: performance.client.segment },
  performance.meta.asOf
);
const { meta, blocks, faq } = article;

const breadcrumbs: Crumb[] = [
  { label: "Domů", href: "/" },
  { label: navLabel("/clanek", "Článek"), href: "/clanek" },
  { label: meta.category },
  { label: meta.title },
];

export const metadata: Metadata = {
  title: meta.title,
  description: meta.perex,
  alternates: { canonical: REPORT_PATH },
  openGraph: { title: meta.title, description: meta.perex, type: "article", url: reportUrl },
};

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
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.label,
        item: canonical(crumb.href ?? REPORT_PATH),
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

export default function ReportPage() {
  const toc = tableOfContents(article);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* report header */}
      <section className="border-b border-line bg-surface">
        <Container className="max-w-3xl py-12 sm:py-16">
          <Breadcrumbs items={breadcrumbs} />
          <div className="mt-6">
            <Eyebrow>Datový report · generováno z dashboardu</Eyebrow>
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
          <div className="mt-6 flex items-center gap-3 border-t border-line pt-6">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-onyx text-brand-400">
              <Gauge width={18} height={18} />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-navy-800">{meta.author}</p>
              <p className="text-muted">{meta.role}</p>
            </div>
          </div>
        </Container>
      </section>

      {/* body + sticky TOC */}
      <Container className="grid gap-10 py-12 lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Obsah reportu
            </p>
            <ArticleToc items={toc} />
          </div>
        </aside>

        <article className="min-w-0 max-w-2xl">
          <ArticleBody blocks={blocks} />

          <div className="mt-10 flex flex-wrap gap-2 border-t border-line pt-6">
            {meta.tags.map((t) => (
              <span
                key={t}
                className="rounded-pill bg-navy-50 px-3 py-1.5 text-xs font-medium text-muted"
              >
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
                <details
                  key={i}
                  className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium text-navy-800">
                    {f.q}
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[0.95rem] leading-relaxed text-navy-700">
                    {inlineToText(f.a)}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </article>
      </Container>
    </>
  );
}
