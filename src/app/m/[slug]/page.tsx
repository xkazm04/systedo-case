/** Public, SEO-indexable client microsite at a stable URL (/m/{slug}). Renders
 *  the latest performance snapshot as a deterministic article with white-label
 *  brand tokens + Article/Dataset JSON-LD. Server-rendered on every request, so
 *  it's always current; the daily cron (/api/cron/microsite) revalidates it.
 *  Unlike the rest of the case study, these pages are index:true on purpose —
 *  a continuously-fresh, search-findable proof of results per client. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import ArticleBody from "@/components/article/ArticleBody";
import { fmtDate } from "@/lib/format";
import { canonical } from "@/lib/site";
import { getMicrosite, buildMicrositeView } from "@/lib/microsite";

export const runtime = "nodejs";
// Daily self-update target for the cron's revalidatePath.
export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = await getMicrosite(slug);
  if (!config) return { title: "Microsite nenalezena", robots: { index: false, follow: false } };
  const { article } = buildMicrositeView(config);
  const path = `/m/${slug}`;
  return {
    title: article.meta.title,
    description: article.meta.perex,
    alternates: { canonical: path },
    // These microsites are meant to be found — override the site-wide noindex.
    robots: { index: true, follow: true },
    openGraph: { title: article.meta.title, description: article.meta.perex, type: "article", url: canonical(path) },
  };
}

export default async function MicrositePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = await getMicrosite(slug);
  if (!config) notFound();

  const { article, snapshot, asOf } = buildMicrositeView(config);
  const accent = config.accentColor || "var(--color-brand-600)";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.meta.title,
        description: article.meta.perex,
        datePublished: asOf,
        dateModified: asOf,
        author: { "@type": "Organization", name: config.brandName },
        publisher: { "@type": "Organization", name: config.brandName },
        about: { "@type": "Organization", name: config.clientName },
      },
      {
        "@type": "Dataset",
        name: `${config.clientName} — výkonnostní KPI (${snapshot.period.label})`,
        description: `Obrat, náklady, konverze a PNO za ${snapshot.period.label}.`,
        creator: { "@type": "Organization", name: config.brandName },
        dateModified: asOf,
        variableMeasured: [
          { "@type": "PropertyValue", name: "Obrat", value: Math.round(snapshot.current.revenue) },
          { "@type": "PropertyValue", name: "Náklady", value: Math.round(snapshot.current.cost) },
          { "@type": "PropertyValue", name: "Konverze", value: Math.round(snapshot.current.conversions) },
          { "@type": "PropertyValue", name: "PNO", value: Number(snapshot.current.pno.toFixed(4)) },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* white-label brand band */}
      <div style={{ backgroundColor: accent }} className="h-1.5 w-full" aria-hidden />

      <Container className="py-12 sm:py-16">
        <header className="border-b border-line pb-8">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
            {config.brandName}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            {article.meta.title}
          </h1>
          <p className="mt-3 max-w-2xl text-muted">{article.meta.perex}</p>
          <p className="mt-4 text-xs text-muted">
            {config.clientName} · {config.segment} · aktualizováno {fmtDate(asOf)}
          </p>
        </header>

        <article className="prose-article mt-8 max-w-3xl">
          <ArticleBody blocks={article.blocks} />
        </article>
      </Container>
    </>
  );
}
