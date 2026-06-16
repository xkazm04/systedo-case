import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Check } from "@/components/icons";
import { PLAN_INFO } from "@/lib/plans";
import { fmtCZK } from "@/lib/format";

export const metadata: Metadata = {
  title: "Ceník — Systedo",
  description:
    "Plány Systedo: zdarma pro vyzkoušení, Pro pro denní práci s více Google Ads účty, automatickou synchronizaci a týdenní reporty.",
};

export default function PricingPage() {
  return (
    <Container className="py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Ceník</Eyebrow>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          Začněte zdarma, rozšiřte podle potřeby
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Limity chrání placená volání modelu a synchronizace. Free stačí na vyzkoušení celého
          toku; Pro je pro agentury, které řeší více účtů denně.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2 md:gap-6">
        {PLAN_INFO.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col p-7 ${
              plan.featured ? "ring-2 ring-brand-400" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-navy-800">{plan.name}</h2>
              {plan.featured && <Pill tone="brand">Doporučeno</Pill>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{plan.tagline}</p>

            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="tnum text-3xl font-semibold tracking-tight text-navy-800">
                {plan.priceCzk === 0 ? "Zdarma" : fmtCZK(plan.priceCzk)}
              </span>
              {plan.priceCzk > 0 && <span className="text-sm text-muted">/ měsíc</span>}
            </p>

            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-navy-700">
                  <Check width={17} height={17} className="mt-0.5 shrink-0 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>

            {plan.id === "free" ? (
              <Link
                href="/kampane"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-pill border border-line px-5 py-3 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                Vyzkoušet přehled kampaní
                <ArrowRight width={16} height={16} />
              </Link>
            ) : (
              <a
                href="mailto:obchod@systedo.cz?subject=Z%C3%A1jem%20o%20Systedo%20Pro"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
              >
                Mám zájem o Pro
                <ArrowRight width={16} height={16} />
              </a>
            )}
          </div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted">
        Případová studie: platební brána (Stripe) není napojená — upgrade je tenká vrstva nad polem
        <code className="mx-1 rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">plan</code>v
        uživatelově dokumentu. Limity jsou denní a počítají se v UTC.
      </p>
    </Container>
  );
}
