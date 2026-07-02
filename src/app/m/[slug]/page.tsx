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
import { canonical } from "@/lib/site";
import { getMicrosite, buildMicrositeView } from "@/lib/microsite";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    notFound: "Microsite nenalezena",
    datasetName: "{client} — výkonnostní KPI ({period})",
    datasetDesc: "Obrat, náklady, konverze a PNO za {period}.",
    propRevenue: "Obrat",
    propCost: "Náklady",
    propConversions: "Konverze",
    propPno: "PNO",
    updatedAt: "aktualizováno {date}",
  },
  en: {
    notFound: "Microsite not found",
    datasetName: "{client} — performance KPIs ({period})",
    datasetDesc: "Revenue, cost, conversions and cost ratio for {period}.",
    propRevenue: "Revenue",
    propCost: "Cost",
    propConversions: "Conversions",
    propPno: "Cost ratio",
    updatedAt: "updated {date}",
  },
} as const;

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
  const t = await getT(T);
  if (!config) return { title: t("notFound"), robots: { index: false, follow: false } };
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

  const t = await getT(T);
  const fmt = await getServerFormatters();

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
      <script
        type="application/ld+json"
        // Escape `<` so tenant-controlled fields (brandName/clientName) can't break
        // out of the <script> element with `</script>` on this public, indexed page.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

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
            {config.clientName} · {config.segment} · {t("updatedAt", { date: fmt.fmtDate(asOf) })}
          </p>
        </header>

        <article className="prose-article mt-8 max-w-3xl">
          <ArticleBody blocks={article.blocks} />
        </article>
      </Container>
    </>
  );
}
