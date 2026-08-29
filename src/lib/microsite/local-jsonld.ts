/** W2-C — the LocalBusiness JSON-LD a `local-landing` microsite publishes.
 *
 *  ANTI-FABRICATION IS THE WHOLE POINT OF THIS MODULE. Schema.org's LocalBusiness
 *  invites `address`, `telephone`, `openingHoursSpecification`, `geo` and
 *  `aggregateRating` — and this repo has NO NAP data model (no address field on
 *  `Project`, no phone, no verified hours), so every one of those would have to be
 *  invented. Structured data is a machine-readable CLAIM: inventing one is worse than
 *  omitting it, because a search engine treats it as asserted fact.
 *
 *  So this emits ONLY what the server actually knows:
 *    name         — the microsite's white-label brand name
 *    url          — the page's own canonical URL
 *    areaServed   — the locality the page was published for
 *    description  — the page's own intro
 *    makesOffer   — the catalog service, with the catalog price when there is one
 *
 *  There is deliberately no `address` key, and `test-unit/microsite-local-page.test.mjs`
 *  asserts its ABSENCE — so re-adding one is a red test, not a silent regression.
 *  Pure (no React, no store), so the emitted object can be asserted directly. */
import { canonical } from "@/lib/site";
import type { LocalPagePayload } from "./types";

/** Schema.org `priceCurrency` must be an ISO-4217 code. The catalog stores a DISPLAY
 *  currency, which is "Kč" for most Czech tenants — mapped here; anything that is not
 *  already a 3-letter code yields null and the price is then omitted from the offer
 *  rather than published under a currency we would be guessing at. */
export function isoCurrency(currency: string | undefined): string | null {
  const c = (currency ?? "").trim();
  if (!c) return null;
  if (c === "Kč" || c === "kč" || c === "CZK") return "CZK";
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

/** The LocalBusiness graph for a published local-landing page. `brandName` is the
 *  microsite's own white-label identity, `slug` its public address. */
export function localBusinessJsonLd(
  payload: LocalPagePayload,
  opts: { brandName: string; slug: string }
): Record<string, unknown> {
  const currency = isoCurrency(payload.currency);
  const hasPrice = typeof payload.price === "number" && payload.price > 0 && currency !== null;

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    itemOffered: {
      "@type": "Service",
      name: payload.service,
      areaServed: { "@type": "Place", name: payload.area },
    },
    ...(hasPrice ? { price: payload.price, priceCurrency: currency } : {}),
    // "from" is a lower bound, not the price — say so rather than publishing a
    // negotiable figure as if it were fixed.
    ...(hasPrice && payload.priceModel === "from"
      ? {
          priceSpecification: {
            "@type": "PriceSpecification",
            minPrice: payload.price,
            priceCurrency: currency,
          },
        }
      : {}),
  };

  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: opts.brandName,
    url: canonical(`/m/${opts.slug}`),
    description: payload.page.intro,
    areaServed: { "@type": "Place", name: payload.area },
    makesOffer: offer,
  };
}
