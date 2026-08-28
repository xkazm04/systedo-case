/** The rows `/cena` renders, DERIVED from the pricing module rather than typed
 *  next to it — the `facts.ts` pattern applied to pricing.
 *
 *  The rule this file exists to enforce: a price, a plan, an order or a daily
 *  limit on the pricing page is a claim about `src/lib/plans.ts`. The row set,
 *  its order, each plan's name, its monthly price and which card is featured all
 *  come from `PLAN_INFO`; every number inside a feature line arrives through a
 *  `{placeholder}` filled from that plan's own `PLANS` entry. Nothing on the page
 *  can therefore quote a limit the metering does not enforce, or a price the
 *  account page would state differently — and `test-unit/pricing-plan-rows.test.mjs`
 *  fails if a number is ever typed into the copy instead.
 *
 *  What IS hand-written here is the copy: the tagline and the feature lines, in
 *  both locales, colocated with the components that render them (the same
 *  convention as a component's `T` dict — `AGENTS.md` architecture note 8).
 *  `PlanInfo` used to carry a cs-only `tagline`/`features` pair of its own; it
 *  had drifted from what this page actually shows and its last reader was the
 *  retired `/lp/distilled` variant, so the duplicate is gone and this is the one
 *  place the words live.
 *
 *  Pure: no React, no I/O. The caller injects the integer formatter so the
 *  limits are localized by the page's own formatting chokepoint. */
import { PLANS, PLAN_INFO, type Plan } from "@/lib/plans";
import { interpolate } from "@/lib/i18n/interpolate";
import type { SupportedLocale } from "@/lib/format";

export interface PlanRow {
  id: Plan;
  name: string;
  /** monthly price in CZK; 0 = free */
  priceCzk: number;
  /** the highlighted/recommended card */
  featured: boolean;
  tagline: string;
  /** feature lines with `{aiEval}` / `{sync}` / `{image}` already filled */
  features: string[];
}

/** Per-plan marketing copy, keyed by plan id and locale.
 *
 *  The daily limits are NOT typed out: `{aiEval}` / `{sync}` / `{image}` are
 *  filled from that plan's own `PLANS` entry, so raising a limit in `lib/plans.ts`
 *  can never leave this page quoting the old number in two languages. */
export const PLAN_COPY: Record<
  SupportedLocale,
  Record<Plan, { tagline: string; features: readonly string[] }>
> = {
  cs: {
    free: {
      tagline: "Pro vyzkoušení celého toku na ukázkových i živých datech.",
      features: [
        // The free-channel path needs no ad account, no budget and no paid tier —
        // it is the one thing the product does for someone who has never bought a
        // click, so it leads the free tier (/kanaly-zdarma).
        "Plán bezplatných kanálů viditelnosti (bez rozpočtu na reklamu)",
        "{aiEval} AI vyhodnocení denně",
        "{sync} synchronizací Google Ads denně",
        "{image} generování vizuálů denně",
        "Připojení vlastního účtu Google Ads",
        "Doporučené přesuny rozpočtu (bez AI)",
        "Sdílené reporty pro klienty",
      ],
    },
    pro: {
      tagline: "Pro agentury a denní práci s více účty.",
      features: [
        "{aiEval} AI vyhodnocení denně",
        "{sync} synchronizací denně",
        "{image} generování vizuálů denně",
        "Automatická hodinová synchronizace + e-mail alerty",
        "Týdenní souhrnný report",
        "Prioritní zpracování",
      ],
    },
    byom: {
      tagline: "Vlastní API klíč, neomezené AI generování a volba modelu.",
      features: [
        "Neomezená AI generování přes vlastní klíč",
        "OpenAI, Gemini nebo Claude (přepínání modelů)",
        "Platíte za tokeny přímo poskytovateli",
        "Bez denního limitu na AI nástroje",
        // Honest disclosure: when the user's own key is missing or failing,
        // generation falls back to the app's provider, capped like Free.
        "Záložní generování přes náš klíč: {aiEval} denně",
        "Přístup ke všem AI nástrojům v aplikaci",
      ],
    },
  },
  en: {
    free: {
      tagline: "Try the full flow on demo or live data.",
      features: [
        "A plan of free visibility channels (no ad budget needed)",
        "{aiEval} AI evaluations per day",
        "{sync} Google Ads syncs per day",
        "{image} visual generations per day",
        "Connect your own Google Ads account",
        "Recommended budget moves (no AI)",
        "Shared client reports",
      ],
    },
    pro: {
      tagline: "For agencies and daily work across multiple accounts.",
      features: [
        "{aiEval} AI evaluations per day",
        "{sync} syncs per day",
        "{image} visual generations per day",
        "Automatic hourly sync + e-mail alerts",
        "Weekly summary report",
        "Priority processing",
      ],
    },
    byom: {
      tagline: "Your own API key, unlimited AI generation and model choice.",
      features: [
        "Unlimited AI generation with your own key",
        "OpenAI, Gemini or Claude (switch models)",
        "You pay for tokens directly to the provider",
        "No daily cap on AI tools",
        "Fallback generation on our key: {aiEval} per day",
        "Access to every AI tool in the app",
      ],
    },
  },
};

/** The pricing table, in `PLAN_INFO` order, with every limit filled from that
 *  plan's own `PLANS` entry through the caller's integer formatter. */
export function planRows(locale: SupportedLocale, fmtInt: (n: number) => string): PlanRow[] {
  const copy = PLAN_COPY[locale] ?? PLAN_COPY.cs;
  return PLAN_INFO.map((plan) => {
    const limits = PLANS[plan.id];
    const vars = {
      aiEval: fmtInt(limits.aiEval),
      sync: fmtInt(limits.sync),
      image: fmtInt(limits.image),
    };
    return {
      id: plan.id,
      name: plan.name,
      priceCzk: plan.priceCzk,
      featured: plan.featured === true,
      tagline: copy[plan.id].tagline,
      features: copy[plan.id].features.map((f) => interpolate(f, vars)),
    };
  });
}
