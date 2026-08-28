import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import PricingPlans from "@/components/marketing/pricing/PricingPlans";
import SelfHostBand from "@/components/marketing/pricing/SelfHostBand";
import { getT } from "@/lib/i18n/server";

/** Ceník — pricing. A composer: the page owns its heading, its disclaimer and its
 *  metadata; the plan table and the self-host band are sections of their own under
 *  `components/marketing/pricing/`, and no price, plan or daily limit is written
 *  here — they are derived from `src/lib/plans.ts` by `planRows` and pinned by
 *  `test-unit/pricing-plan-rows.test.mjs`. */

/** Localized so a shared pricing link (the page most likely to be shared) gets a
 *  locale-consistent SERP/social snippet — the body already localizes via getT, but
 *  the metadata was a static English export. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(T);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/cena" },
  };
}

const T = {
  cs: {
    metaTitle: "Ceník – Adamant",
    metaDescription:
      "Adamant je během validace zdarma v plném rozsahu. Placené plány Pro a Vlastní klíč spustíme po ověření produktu. Tabulka ukazuje zamýšlené rozdělení.",
    eyebrow: "Ceník",
    heading: "Během validace zdarma",
    subheading:
      "Adamant je ve validační fázi zdarma v plném rozsahu. Denní limity chrání placená volání modelu a synchronizace. Placené plány níže ukazují, kam ceník míří; spustíme je až po validaci.",
    disclaimer:
      "Placené plány zatím nejsou spuštěné a platební brána není napojená. Během validace nic neúčtujeme. Limity jsou denní a počítají se v UTC.",
  },
  en: {
    metaTitle: "Pricing – Adamant",
    metaDescription:
      "Adamant is entirely free during validation. The paid Pro and Own-key plans launch after the product is validated. The table shows the intended split.",
    eyebrow: "Pricing",
    heading: "Free during validation",
    subheading:
      "During the validation phase Adamant is entirely free. The daily limits protect paid model calls and syncs. The paid plans below show where pricing is headed; they launch only after validation.",
    disclaimer:
      "Paid plans are not live yet and no payment gateway is wired up. Nothing is charged during validation. Limits are daily and counted in UTC.",
  },
} as const;

export default async function PricingPage() {
  const t = await getT(T);

  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">{t("subheading")}</p>
      </div>

      <PricingPlans />
      <SelfHostBand />

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted">{t("disclaimer")}</p>
    </Container>
  );
}
