/** W2-C — the `local-landing` microsite body: ONE service×area landing page,
 *  generated from a coverage gap and published at /m/{slug}.
 *
 *  Everything on this page is either the operator's own white-label identity, the
 *  generated prose they previewed, or a figure the SERVER resolved from the catalog.
 *  There is no address, no phone, no opening hours and no review block — the repo has
 *  no NAP data model, and a public page is exactly where inventing one would do the
 *  most damage (see `@/lib/microsite/local-jsonld`). A contact link appears only when
 *  the operator typed one. Server component. */
import { Container } from "@/components/ui";
import JsonLd from "@/components/JsonLd";
import type { MicrositeConfig } from "@/lib/microsite";
import type { LocalPagePayload } from "@/lib/microsite";
import { localBusinessJsonLd } from "@/lib/microsite/local-jsonld";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    priceFrom: "od {price}",
    priceFixed: "{price}",
    priceQuote: "cena na vyžádání",
    priceLabel: "Cena",
    faqTitle: "Časté dotazy",
    contact: "Kontaktovat",
    updatedAt: "aktualizováno {date}",
  },
  en: {
    priceFrom: "from {price}",
    priceFixed: "{price}",
    priceQuote: "price on request",
    priceLabel: "Price",
    faqTitle: "Frequently asked questions",
    contact: "Get in touch",
    updatedAt: "updated {date}",
  },
} as const;

export default async function LocalLanding({
  config,
  local,
}: {
  config: MicrositeConfig;
  local: LocalPagePayload;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const accent = config.accentColor || "var(--color-brand-600)";
  const { page } = local;

  // The price is the CATALOG number carried in the payload — never model prose.
  const priced = typeof local.price === "number" && local.price > 0;
  const amount = priced
    ? local.currency && local.currency !== "Kč" && local.currency !== "CZK"
      ? `${fmt.fmtInt(Math.round(local.price!))} ${local.currency}`
      : fmt.fmtCZK(local.price!)
    : "";
  const priceText = priced
    ? t(local.priceModel === "fixed" ? "priceFixed" : "priceFrom", { price: amount })
    : local.priceModel === "quote"
      ? t("priceQuote")
      : "";

  return (
    <>
      <JsonLd data={localBusinessJsonLd(local, { brandName: config.brandName, slug: config.slug })} />

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
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
            {local.service} · {local.area}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            {page.headline}
          </h1>
          <p className="mt-3 max-w-2xl text-muted">{page.intro}</p>
          {priceText && (
            <p className="tnum mt-4 text-sm font-semibold text-navy-800">
              {t("priceLabel")}: {priceText}
            </p>
          )}
          {local.contact && (
            <p className="mt-5">
              <a
                href={local.contact}
                className="inline-flex items-center rounded-pill px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {page.cta || t("contact")}
              </a>
            </p>
          )}
          <p className="mt-4 text-xs text-muted">
            {t("updatedAt", { date: fmt.fmtDate(local.generatedAt.slice(0, 10)) })}
          </p>
        </header>

        <div className="mt-8 max-w-3xl space-y-8">
          {page.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-navy-800">{s.heading}</h2>
              <p className="mt-2 whitespace-pre-line text-navy-700">{s.body}</p>
            </section>
          ))}

          {page.faq.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-navy-800">{t("faqTitle")}</h2>
              <dl className="mt-3 space-y-4">
                {page.faq.map((f) => (
                  <div key={f.q}>
                    <dt className="text-sm font-semibold text-navy-800">{f.q}</dt>
                    <dd className="mt-1 text-navy-700">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* The CTA without an operator contact is a sentence, not a link — there is
              no phone or address to send anyone to, and inventing one is the exact
              fabrication this page is built to avoid. */}
          {page.cta && !local.contact && (
            <p className="rounded-lg bg-canvas px-4 py-3 text-sm font-medium text-navy-800">{page.cta}</p>
          )}
        </div>
      </Container>
    </>
  );
}
