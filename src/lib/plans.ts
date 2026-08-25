/** Plan catalogue + usage shapes — pure, no I/O, no firebase. Split out of
 *  `usage.ts` so client components (the header usage meter) and the public
 *  pricing page can import the limits/labels without pulling firebase-admin into
 *  the browser/edge bundle. The server-only metering (`consume`/`getUsage`) stays
 *  in `usage.ts` and re-exports these for back-compat. */

export type Plan = "free" | "pro" | "byom";
export type UsageKind = "aiEval" | "sync" | "image";

export interface PlanLimits {
  /** AI evaluations (campaign / assistant) per UTC day */
  aiEval: number;
  /** Google Ads syncs per UTC day */
  sync: number;
  /** Creative Studio image generations per UTC day */
  image: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  free: { aiEval: 25, sync: 50, image: 5 },
  pro: { aiEval: 1000, sync: 1000, image: 100 },
  // BYOM ("bring your own model"): the headline is UNLIMITED AI generation, but
  // that is delivered at runtime — a BYOM-served call (the user's own provider
  // key) skips metering entirely. These numbers are only the APP-FUNDED fallback
  // cap: when the user's provider fails through our fault (or they haven't added a
  // key yet), generation degrades to the app's provider, and that path must stay
  // bounded like Free so a $5 plan can't burn the app's budget. sync/image are the
  // app-funded extras that the BYOM tier does not expand (those stay Pro-only).
  byom: { aiEval: 25, sync: 50, image: 5 },
};

/** Whether a plan grants BYOM (own provider key + model switching). Single seam
 *  so the route/entitlement checks don't hard-code the plan id in several places;
 *  widen this if another tier should also unlock BYOM later. */
export function planHasByom(plan: Plan): boolean {
  return plan === "byom";
}

/** Whether a NON-plan switch unlocks the BYOM entitlement.
 *
 *  Two cases, deliberately distinct:
 *  - `BYOM_MATRIX=true` — a DEV convenience, HARD-GATED off when
 *    NODE_ENV=production (same posture as LOCAL_DB / DEV_AUTH), so an
 *    innocuously-named env var can never turn the paid feature free for every
 *    user in a real deployment.
 *  - `SELF_HOSTED=true` — honoured in production. In a self-hosted install BYOM
 *    is not a plan feature; it is the ONLY model path (the operator brings their
 *    own keys/CLIs and pays their own provider) — docs/open-source/self-hosting.md §4.
 *
 *  Pure (takes the env as an argument) so it is unit-testable without pulling
 *  firebase-admin via usage.ts. */
export function devByomUnlockActive(env: {
  BYOM_MATRIX?: string;
  NODE_ENV?: string;
  SELF_HOSTED?: string;
}): boolean {
  if (env.SELF_HOSTED === "true") return true;
  return env.BYOM_MATRIX === "true" && env.NODE_ENV !== "production";
}

/** How a plan's AI allowance must be PRESENTED. This exists so no surface can quote
 *  `PLANS[plan].aiEval` as "your daily limit" for the BYOM tier: there the headline
 *  is unlimited generation, delivered at RUNTIME (a call served by the user's own
 *  provider key skips metering entirely), and the listed number is only the
 *  app-funded fallback cap for when their key is missing or failing. Reading that
 *  number as the plan's cap under-sells the plan; hiding it over-sells it. Pure. */
export type AiAllowanceKind = "capped" | "unlimited-via-own-key";

export function aiAllowanceKind(plan: Plan): AiAllowanceKind {
  return planHasByom(plan) ? "unlimited-via-own-key" : "capped";
}

/** The monthly price shown for a plan, from the same catalogue /cena renders, so
 *  the account page and the pricing page can never quote different numbers. */
export function planPriceCzk(plan: Plan): number {
  return PLAN_INFO.find((p) => p.id === plan)?.priceCzk ?? 0;
}

/** Everything a display surface needs to state a user's plan honestly: what they
 *  are on, what it costs, whether the BYOM entitlement is actually active for them
 *  (which is NOT always `planHasByom` — a dev flag can unlock it off-production),
 *  and how the AI allowance must be framed. Pure; the caller resolves `byomActive`
 *  from the server-side entitlement check (`byomUnlocked`). */
export interface PlanEntitlement {
  plan: Plan;
  limits: PlanLimits;
  used: Record<UsageKind, number>;
  priceCzk: number;
  byomActive: boolean;
  aiAllowance: AiAllowanceKind;
}

export function planEntitlement(
  status: UsageStatus,
  byomActive: boolean
): PlanEntitlement {
  return {
    plan: status.plan,
    limits: status.limits,
    used: status.used,
    priceCzk: planPriceCzk(status.plan),
    byomActive,
    aiAllowance: aiAllowanceKind(status.plan),
  };
}

export interface UsageStatus {
  plan: Plan;
  limits: PlanLimits;
  used: Record<UsageKind, number>;
  /** UTC day the counters apply to */
  day: string;
}

/** Marketing copy for each plan, shown on /cena. Price is illustrative for the
 *  case study (no billing is wired — upgrading the `plan` field is the seam). */
export interface PlanInfo {
  id: Plan;
  name: string;
  /** monthly price in CZK; 0 = free */
  priceCzk: number;
  tagline: string;
  features: string[];
  /** the highlighted/recommended card */
  featured?: boolean;
}

export const PLAN_INFO: PlanInfo[] = [
  {
    id: "free",
    name: "Free",
    priceCzk: 0,
    tagline: "Pro vyzkoušení celého toku na ukázkových i živých datech.",
    features: [
      `${PLANS.free.aiEval} AI vyhodnocení denně`,
      `${PLANS.free.sync} synchronizací Google Ads denně`,
      `${PLANS.free.image} generování vizuálů denně`,
      "Připojení vlastního účtu Google Ads",
      "Doporučené přesuny rozpočtu (bez AI)",
      "Sdílené reporty pro klienty",
    ],
  },
  {
    id: "byom",
    // ~5 USD/měsíc ≈ 125 Kč. Vlastní API klíč, neomezené AI generování.
    name: "Vlastní klíč",
    priceCzk: 125,
    tagline: "Vlastní API klíč, neomezené AI generování a volba modelu.",
    features: [
      "Neomezená AI generování přes vlastní klíč",
      "OpenAI, Gemini nebo Claude — přepínání modelů",
      "Platíte za tokeny přímo poskytovateli",
      "Bez denního limitu na AI nástroje (přes vlastní klíč)",
      // Honest disclosure: when the user's own key is missing/failing, generation
      // falls back to our app-funded provider, capped like Free (PLANS.byom).
      `Záložní generování přes náš klíč: ${PLANS.byom.aiEval}/den`,
      "Přístup ke všem AI nástrojům v aplikaci",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceCzk: 490,
    tagline: "Pro agentury a denní práci s více účty.",
    features: [
      `${PLANS.pro.aiEval} AI vyhodnocení denně`,
      `${PLANS.pro.sync} synchronizací denně`,
      `${PLANS.pro.image} generování vizuálů denně`,
      "Automatická hodinová synchronizace + e-mail alerty",
      "Týdenní souhrnný report",
      "Prioritní zpracování",
    ],
    featured: true,
  },
];

/** Where the in-app upgrade CTA / quota-exceeded messages point. */
export const UPGRADE_PATH = "/cena";
