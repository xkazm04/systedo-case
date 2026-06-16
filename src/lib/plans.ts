/** Plan catalogue + usage shapes — pure, no I/O, no firebase. Split out of
 *  `usage.ts` so client components (the header usage meter) and the public
 *  pricing page can import the limits/labels without pulling firebase-admin into
 *  the browser/edge bundle. The server-only metering (`consume`/`getUsage`) stays
 *  in `usage.ts` and re-exports these for back-compat. */

export type Plan = "free" | "pro";
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
};

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
      "Připojení vlastního Google Ads účtu",
      "Doporučené přesuny rozpočtu (bez AI)",
      "Sdílené reporty pro klienty",
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
