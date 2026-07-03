import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClass, Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Check } from "@/components/icons";
import { PLAN_INFO } from "@/lib/plans";
import { getT, getServerFormatters } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Pricing — Adamant",
  description:
    "Adamant plans: free to try, Pro for daily work across multiple Google Ads accounts, automatic sync and weekly reports.",
};

const T = {
  cs: {
    eyebrow: "Ceník",
    heading: "Začněte zdarma, rozšiřte podle potřeby",
    subheading:
      "Limity chrání placená volání modelu a synchronizace. Free stačí na vyzkoušení celého toku; Pro je pro agentury, které řeší více účtů denně.",
    recommended: "Doporučeno",
    free: "Zdarma",
    perMonth: "/ měsíc",
    ctaFree: "Vyzkoušet přehled kampaní",
    ctaPro: "Mám zájem o Pro",
    disclaimer:
      "Případová studie: platební brána (Stripe) není napojená — upgrade je tenká vrstva nad polem",
    disclaimerSuffix: "v uživatelově dokumentu. Limity jsou denní a počítají se v UTC.",
  },
  en: {
    eyebrow: "Pricing",
    heading: "Start free, scale when you need to",
    subheading:
      "Limits protect paid model calls and syncs. Free is enough to try the full flow; Pro is for agencies managing multiple accounts daily.",
    recommended: "Recommended",
    free: "Free",
    perMonth: "/ month",
    ctaFree: "Try the campaign overview",
    ctaPro: "I’m interested in Pro",
    disclaimer:
      "Case study: the payment gateway (Stripe) is not wired up — upgrading is a thin layer over the",
    disclaimerSuffix: "field in the user document. Limits are daily and counted in UTC.",
  },
} as const;

/** Per-plan marketing copy, keyed by plan id and locale. */
const PLAN_COPY: Record<
  "cs" | "en",
  Record<"free" | "pro", { tagline: string; features: readonly string[] }>
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

      <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
        {PLAN_INFO.map((plan) => {
          const copy = planCopy[plan.id as "free" | "pro"];
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
                // escape hatch the primitive exports for exactly this case.
                <Link href="/kampane" className={buttonClass("secondary", "lg", { className: "mt-7" })}>
                  {t("ctaFree")}
                  <ArrowRight width={16} height={16} />
                </Link>
              ) : (
                <Button
                  href="mailto:obchod@systedo.cz?subject=Z%C3%A1jem%20o%20Adamant%20Pro"
                  variant="primary"
                  size="lg"
                  className="mt-7 active:scale-[0.99]"
                >
                  {t("ctaPro")}
                  <ArrowRight width={16} height={16} />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted">
        {t("disclaimer")}
        <code className="mx-1 rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">plan</code>
        {t("disclaimerSuffix")}
      </p>
    </Container>
  );
}
