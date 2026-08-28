/** The three-tier pricing table on `/cena`.
 *
 *  It documents pricing INTENT while the product is free during validation: the
 *  paid tiers are shown but not purchasable, and the only actionable CTA leads
 *  into the app. Nothing here decides what a plan is — the rows, their order,
 *  their prices and their filled limits all arrive from `planRows` (./planRows),
 *  which reads `src/lib/plans.ts`. This file only renders them. */
import Link from "next/link";
import { buttonClass, Pill } from "@/components/ui";
import { ArrowRight, Check } from "@/components/icons";
import { getT, getServerFormatters } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { planRows } from "./planRows";

const T = {
  cs: {
    recommended: "Doporučeno",
    free: "Zdarma",
    perMonth: "/ měsíc",
    ctaFree: "Začít zdarma",
    comingSoon: "Spustíme po validaci",
  },
  en: {
    recommended: "Recommended",
    free: "Free",
    perMonth: "/ month",
    ctaFree: "Start free",
    comingSoon: "Coming after validation",
  },
} as const;

export default async function PricingPlans() {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const locale = await getServerLocale();
  const rows = planRows(locale, fmt.fmtInt);

  return (
    <div className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
      {rows.map((plan) => (
        <div
          key={plan.id}
          className={`card flex flex-col p-7 ${plan.featured ? "ring-2 ring-brand-400" : ""}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-navy-800">{plan.name}</h2>
            {plan.featured && <Pill tone="brand">{t("recommended")}</Pill>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{plan.tagline}</p>

          <p className="mt-6 flex items-baseline gap-1.5">
            <span className="tnum text-3xl font-semibold tracking-tight text-navy-800">
              {plan.priceCzk === 0 ? t("free") : fmt.fmtCZK(plan.priceCzk)}
            </span>
            {plan.priceCzk > 0 && <span className="text-sm text-muted">{t("perMonth")}</span>}
          </p>

          <ul className="mt-6 flex-1 space-y-3">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-navy-700">
                <Check width={17} height={17} className="mt-0.5 shrink-0 text-brand-600" />
                {f}
              </li>
            ))}
          </ul>

          {plan.priceCzk === 0 ? (
            // Next <Link> wearing the shared Button style — the buttonClass
            // escape hatch the primitive exports for exactly this case. The free
            // tier is the only actionable plan during validation, so it carries
            // the primary button and leads straight into the app. Keyed off the
            // PRICE rather than off the id: "the plan that costs nothing" is the
            // real condition, and it follows lib/plans.ts if the split changes.
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
      ))}
    </div>
  );
}
