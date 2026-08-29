/** Public, SEO-indexable client microsite at a stable URL (/m/{slug}). This is a
 *  dynamic route (no `use cache`, no `revalidate`): under Cache Components it
 *  re-renders on EVERY request, so it is always current with no scheduled hook.
 *  Unlike the rest of the case study, these pages are index:true on purpose.
 *
 *  W2-C — the route now BRANCHES on `config.kind`, which the registry has carried
 *  since F3 but nothing read:
 *    performance   → the self-updating proof page (body extracted verbatim into
 *                    `PerformanceMicrosite`, so nothing about it moved)
 *    local-landing → one generated service×area landing page with LocalBusiness
 *                    JSON-LD (`LocalLanding`)
 *    lp            → one arm of a landing-page experiment, drawn per request, with
 *                    its view counted and its id carried into the convert beacon
 *                    (`LpMicrosite`; W3-B)
 *  A `local-landing` or `lp` config with no payload is a 404 rather than a blank
 *  public page — the publish path refuses to create one, so this only fires for a
 *  config written by a newer deploy and then rolled back. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PerformanceMicrosite from "@/components/microsite/PerformanceMicrosite";
import LocalLanding from "@/components/microsite/LocalLanding";
import LpMicrosite from "@/components/microsite/LpMicrosite";
import { canonical } from "@/lib/site";
import { getMicrosite, resolveMicrositeView } from "@/lib/microsite";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: { notFound: "Microsite nenalezena", localDesc: "{service} v oblasti {area} — {brand}." },
  en: { notFound: "Microsite not found", localDesc: "{service} in {area} — {brand}." },
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
  const path = `/m/${slug}`;

  // A local landing page exists TO RANK: it carries the tenant's own service, price
  // and locality — nothing illustrative — so it is indexable unconditionally, unlike
  // the performance page whose indexability depends on a live sync.
  if (config.kind === "local-landing" && config.local) {
    const { local } = config;
    const description =
      local.page.intro ||
      t("localDesc", { service: local.service, area: local.area, brand: config.brandName });
    return {
      title: `${local.page.headline} | ${config.brandName}`,
      description,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        title: local.page.headline,
        description,
        type: "website",
        url: canonical(path),
      },
    };
  }

  // W3-B — an experiment arm is NOINDEX, deliberately the opposite call from the
  // local landing page above. A local page exists to rank and outlives the campaign
  // that made it; an experiment page exists to be measured and DIES when the test
  // ends. Letting it accumulate search identity would mean indexing one arm's copy
  // (whichever the crawler happened to draw), ranking a URL that will 404 in six
  // weeks, and — worst — letting organic arrivals land on a page whose split they
  // were never randomised into. `follow` stays true so an operator's own link check
  // still works.
  if (config.kind === "lp" && config.lp) {
    const arm = config.lp.arms[0];
    return {
      title: `${arm?.headline ?? config.brandName} | ${config.brandName}`,
      robots: { index: false, follow: true },
    };
  }

  const view = await resolveMicrositeView(config);
  const { article } = view;
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

  if (config.kind === "local-landing") {
    if (!config.local) notFound();
    return <LocalLanding config={config} local={config.local} />;
  }

  if (config.kind === "lp") {
    if (!config.lp) notFound();
    return <LpMicrosite config={config} lp={config.lp} />;
  }

  const view = await resolveMicrositeView(config);
  return <PerformanceMicrosite config={config} view={view} />;
}
