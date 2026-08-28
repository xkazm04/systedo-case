/** Closing band of `/kanaly-zdarma`. Mirrors the homepage's dark closing section
 *  so the feature page ends the way the rest of the site does. The only actionable
 *  CTA is the free product itself, matching the free-during-validation decision
 *  recorded in PRODUCT.md and rendered on /cena. */
import Link from "next/link";
import { buttonClass, Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    heading: "Než zaplatíte první proklik, vyčerpejte to, co je zdarma.",
    sub: "Během validace je Adamant zdarma v plném rozsahu. Bez platební brány.",
    ctaStart: "Začít zdarma",
    ctaPricing: "Co je v bezplatném plánu",
  },
  en: {
    heading: "Before you pay for the first click, exhaust what is free.",
    sub: "Adamant is entirely free during validation. No payment gateway.",
    ctaStart: "Start free",
    ctaPricing: "What the free plan covers",
  },
} as const;

export default async function FreeChannelsClosing() {
  const t = await getT(T);
  return (
    <section className="border-t border-onyx-line bg-onyx">
      <Container className="py-14">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold leading-snug tracking-tight text-white">
              {t("heading")}
            </h2>
            <p className="mt-2 text-sm text-onyx-muted">{t("sub")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/app" className={buttonClass("primary", "lg")}>
              {t("ctaStart")}
              <ArrowRight width={17} height={17} />
            </Link>
            <Link
              href="/cena"
              className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200"
            >
              {t("ctaPricing")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
