import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Check } from "@/components/icons";
import { PLAN_INFO, type Plan } from "@/lib/plans";
import { getT, getServerFormatters } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

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
    metaTitle: "Ceník — Adamant",
    metaDescription:
      "Adamant je během validace zdarma v plném rozsahu. Placené plány Pro a Vlastní klíč spustíme po ověření produktu — tabulka ukazuje zamýšlené rozdělení.",
    eyebrow: "Ceník",
    heading: "Během validace zdarma",
    subheading:
      "Adamant je ve validační fázi zdarma v plném rozsahu — denní limity chrání placená volání modelu a synchronizace. Placené plány níže ukazují, kam ceník míří; spustíme je až po validaci.",
    recommended: "Doporučeno",
    free: "Zdarma",
    perMonth: "/ měsíc",
    ctaFree: "Začít zdarma",
    comingSoon: "Připravujeme po validaci",
    disclaimer:
      "Placené plány zatím nejsou spuštěné a platební brána není napojená — během validace nic neúčtujeme. Limity jsou denní a počítají se v UTC.",
  },
  en: {
    metaTitle: "Pricing — Adamant",
    metaDescription:
      "Adamant is free in full during validation. The paid Pro and Own-key plans launch after the product is validated — the table shows the intended split.",
    eyebrow: "Pricing",
    heading: "Free during validation",
    subheading:
      "During the validation phase Adamant is free in full — the daily limits protect paid model calls and syncs. The paid plans below show where pricing is headed; they launch only after validation.",
    recommended: "Recommended",
    free: "Free",
    perMonth: "/ month",
    ctaFree: "Start free",
    comingSoon: "Coming after validation",
    disclaimer:
      "Paid plans are not live yet and no payment gateway is wired up — nothing is charged during validation. Limits are daily and counted in UTC.",
  },
} as const;

/** Per-plan marketing copy, keyed by plan id and locale. */
const PLAN_COPY: Record<
  "cs" | "en",
  Record<Plan, { tagline: string; features: readonly string[] }>
> = {
  cs: {
    free: {
      tagline: "Pro vyzkoušení celého toku na ukázkových i živých datech.",
      features: [
        "25 AI vyhodnocení denně",
        "50 synchronizací Google Ads denně",
        "5 generování vizuálů denně",
        "Připojení vlastního Google Ads účtu",
        "Doporučené přesuny rozpočtu (bez AI)",
        "Sdílené reporty pro klienty",
      ],
    },
    pro: {
      tagline: "Pro agentury a denní práci s více účty.",
      features: [
        "1 000 AI vyhodnocení denně",
        "1 000 synchronizací denně",
        "100 generování vizuálů denně",
        "Automatická hodinová synchronizace + e-mail alerty",
        "Týdenní souhrnný report",
        "Prioritní zpracování",
      ],
    },
    byom: {
      tagline: "Vlastní API klíč, neomezené AI generování a volba modelu.",
      features: [
        "Neomezená AI generování přes vlastní klíč",
        "OpenAI, Gemini nebo Claude — přepínání modelů",
        "Platíte tokeny přímo poskytovateli",
        "Bez denního limitu na AI nástroje",
        "Přístup ke všem AI nástrojům v aplikaci",
      ],
    },
  },
  en: {
    free: {
      tagline: "Try the full flow on demo or live data.",
      features: [
        "25 AI evaluations per day",
        "50 Google Ads syncs per day",
        "5 visual generations per day",
        "Connect your own Google Ads account",
        "Recommended budget moves (no AI)",
        "Shared client reports",
      ],
    },
    pro: {
      tagline: "For agencies and daily work across multiple accounts.",
      features: [
        "1 000 AI evaluations per day",
        "1 000 syncs per day",
        "100 visual generations per day",
        "Automatic hourly sync + e-mail alerts",
        "Weekly summary report",
        "Priority processing",
      ],
    },
    byom: {
      tagline: "Your own API key, unlimited AI generation and model choice.",
      features: [
        "Unlimited AI generation with your own key",
        "OpenAI, Gemini or Claude — switch models",
        "You pay tokens directly to the provider",
        "No daily cap on AI tools",
        "Access to every AI tool in the app",
      ],
    },
  },
};

export default async function PricingPage() {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const locale = await getServerLocale();
  const planCopy = PLAN_COPY[locale] ?? PLAN_COPY.cs;

  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          {t("subheading")}
        </p>
      </div>

      {/* The three-tier table documents pricing INTENT (limits, plan split) while
          the product is free during validation — the paid tiers are shown but not
          purchasable, and the only actionable CTA leads into the app. */}

      <div className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
        {PLAN_INFO.map((plan) => {
          const copy = planCopy[plan.id];
          return (
            <div
              key={plan.id}
              className={`card flex flex-col p-7 ${
                plan.featured ? "ring-2 ring-brand-400" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-navy-800">{plan.name}</h2>
                {plan.featured && <Pill tone="brand">{t("recommended")}</Pill>}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy.tagline}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="tnum text-3xl font-semibold tracking-tight text-navy-800">
                  {plan.priceCzk === 0 ? t("free") : fmt.fmtCZK(plan.priceCzk)}
                </span>
                {plan.priceCzk > 0 && (
                  <span className="text-sm text-muted">{t("perMonth")}</span>
                )}
              </p>

              <ul className="mt-6 flex-1 space-y-3">
                {copy.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-navy-700">
                    <Check width={17} height={17} className="mt-0.5 shrink-0 text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.id === "free" ? (
                // Next <Link> wearing the shared Button style — the buttonClass
                // escape hatch the primitive exports for exactly this case. The
                // free tier is the only actionable plan during validation, so it
                // carries the primary button and leads straight into the app.
                <Link href="/app" className={buttonClass("primary", "lg", { className: "mt-7" })}>
                  {t("ctaFree")}
                  <ArrowRight width={16} height={16} />
                </Link>
              ) : (
                // Free-during-validation: paid tiers are documented intent, not
                // purchasable — no mailto, no payment seam, just an honest state.
                <div className="mt-7 rounded-pill border border-dashed border-line px-5 py-3 text-center text-sm font-semibold text-muted">
                  {t("comingSoon")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted">
        {t("disclaimer")}
      </p>
    </Container>
  );
}
