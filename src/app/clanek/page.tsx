import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Pill } from "@/components/ui";
import ArticleBody from "@/components/article/ArticleBody";
import ArticleToc from "@/components/article/ArticleToc";
import ReadingProgress from "@/components/article/ReadingProgress";
import AuthorBio from "@/components/article/AuthorBio";
import { ArrowRight, Clock } from "@/components/icons";
import { article, inlineToText, tableOfContents } from "@/lib/article";
import { fmtDate } from "@/lib/format";

const { meta, blocks, faq } = article;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.perex,
  openGraph: { title: meta.title, description: meta.perex, type: "article" },
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

// Structured data: Article + FAQPage, so the page is rich-result ready.
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
          <Eyebrow>Úkol 2 · Článek pro mionelo.cz</Eyebrow>
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
                  title={`Aktualizováno ${fmtDate(meta.dateModifiedISO)}`}
                >
                  <Clock width={13} height={13} aria-hidden />
                  Aktualizováno {fmtDate(meta.dateModifiedISO)}
                </time>
              </>
            )}
            <span>·</span>
            <span>{meta.readingMinutes} min čtení</span>
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

          {/* continue reading — links to the other pages of the site */}
          <section className="mt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Pokračujte ve studii
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Link
                href="/dashboard"
                className="card group flex items-center justify-between p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop"
              >
                <div>
                  <p className="text-sm font-semibold text-navy-800">Výkonnostní dashboard</p>
                  <p className="mt-0.5 text-sm text-muted">Jak si klient vede v číslech</p>
                </div>
                <ArrowRight width={18} height={18} className="text-brand-600 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/ai-asistent"
                className="card group flex items-center justify-between p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop"
              >
                <div>
                  <p className="text-sm font-semibold text-navy-800">AI asistent</p>
                  <p className="mt-0.5 text-sm text-muted">Generátor PPC inzerátů na Gemini</p>
                </div>
                <ArrowRight width={18} height={18} className="text-brand-600 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </section>
        </article>
      </Container>
    </>
  );
}
