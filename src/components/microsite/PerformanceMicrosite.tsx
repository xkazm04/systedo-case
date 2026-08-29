/** The `performance` microsite body — the self-updating proof page every microsite
 *  was until W2-C. Extracted VERBATIM from `/m/[slug]/page.tsx` so the route can
 *  branch on `config.kind` without the performance page's markup, JSON-LD or
 *  disclosure moving a byte. Server component. */
import { Container } from "@/components/ui";
import JsonLd from "@/components/JsonLd";
import ArticleBody from "@/components/article/ArticleBody";
import type { MicrositeConfig } from "@/lib/microsite";
import type { MicrositeView } from "@/lib/microsite";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
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

export default async function PerformanceMicrosite({
  config,
  view,
}: {
  config: MicrositeConfig;
  view: MicrositeView;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const { article, snapshot, asOf, live } = view;
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
