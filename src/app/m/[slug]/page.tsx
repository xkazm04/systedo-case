/** Public, SEO-indexable client microsite at a stable URL (/m/{slug}). Renders
 *  the latest performance snapshot as a deterministic article with white-label
 *  brand tokens + Article/Dataset JSON-LD. This is a dynamic route (no `use
 *  cache`, no `revalidate`): under Cache Components it re-renders from the latest
 *  snapshot on EVERY request, so it is always current with no scheduled hook —
 *  there was a daily revalidate cron, but with nothing cached to invalidate it was
 *  a no-op and has been removed. Unlike the rest of the case study, these pages
 *  are index:true on purpose — a continuously-fresh, search-findable proof of
 *  results per client. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import JsonLd from "@/components/JsonLd";
import ArticleBody from "@/components/article/ArticleBody";
import { canonical } from "@/lib/site";
import { getMicrosite, resolveMicrositeView } from "@/lib/microsite";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    notFound: "Microsite nenalezena",
    datasetName: "{client}: výkonnostní KPI ({period})",
    datasetDesc: "Obrat, náklady, konverze a PNO za {period}.",
    propRevenue: "Obrat",
    propCost: "Náklady",
    propConversions: "Konverze",
    propPno: "PNO",
    updatedAt: "aktualizováno {date}",
    illustrative: "Ilustrativní ukázková data (case study). Nejde o reálné výsledky klienta.",
  },
  en: {
    notFound: "Microsite not found",
    datasetName: "{client}: performance KPIs ({period})",
    datasetDesc: "Revenue, cost, conversions and PNO for {period}.",
    propRevenue: "Revenue",
    propCost: "Cost",
    propConversions: "Conversions",
    propPno: "PNO",
    updatedAt: "updated {date}",
    illustrative: "Illustrative sample data (case study), not a client's real results.",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = await getMicrosite(slug);
  const t = await getT(T);
  if (!config) return { title: t("notFound"), robots: { index: false, follow: false } };
  const view = await resolveMicrositeView(config);
  const { article } = view;
  const path = `/m/${slug}`;
  return {
    title: article.meta.title,
    description: article.meta.perex,
    alternates: { canonical: path },
    // Real tenants' pages are meant to be found (override the site-wide noindex);
    // an illustrative (case-study) microsite is NEVER indexed — demo numbers must
    // not be published as search-findable "proof". `view.live` is decided per
    // request from actually-synced rows, so a cleared sync reverts to noindex.
    robots: view.live || !config.illustrative ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: article.meta.title, description: article.meta.perex, type: "article", url: canonical(path) },
  };
}

export default async function MicrositePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = await getMicrosite(slug);
  if (!config) notFound();

  const t = await getT(T);
  const fmt = await getServerFormatters();

  const { article, snapshot, asOf, live } = await resolveMicrositeView(config);
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
        name: t("datasetName", { client: config.clientName, period: snapshot.period.label }),
        description: t("datasetDesc", { period: snapshot.period.label }),
        creator: { "@type": "Organization", name: config.brandName },
        dateModified: asOf,
        variableMeasured: [
          { "@type": "PropertyValue", name: t("propRevenue"), value: Math.round(snapshot.current.revenue) },
          { "@type": "PropertyValue", name: t("propCost"), value: Math.round(snapshot.current.cost) },
          { "@type": "PropertyValue", name: t("propConversions"), value: Math.round(snapshot.current.conversions) },
          { "@type": "PropertyValue", name: t("propPno"), value: Number(snapshot.current.pno.toFixed(4)) },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* white-label brand band */}
      <div style={{ backgroundColor: accent }} className="h-1.5 w-full" aria-hidden />

      <Container className="py-12 sm:py-16">
        <header className="border-b border-line pb-8">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
            {config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt={config.brandName} className="h-8 w-auto max-w-[140px] object-contain" />
            )}
            {config.brandName}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            {article.meta.title}
          </h1>
          <p className="mt-3 max-w-2xl text-muted">{article.meta.perex}</p>
          <p className="mt-4 text-xs text-muted">
            {config.clientName} · {config.segment} · {t("updatedAt", { date: fmt.fmtDate(asOf) })}
          </p>
          {/* Disclosure only on the sample branch — a live view IS the client's real
              synced series, so the banner would be the opposite lie. */}
          {!live && config.illustrative && (
            <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">{t("illustrative")}</p>
          )}
        </header>

        <article className="prose-article mt-8 max-w-3xl">
          <ArticleBody blocks={article.blocks} />
        </article>
      </Container>
    </>
  );
}
