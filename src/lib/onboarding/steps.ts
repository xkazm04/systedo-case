/** The type-aware onboarding checklist. Each step deep-links to the module that
 *  completes it; the per-step "done" is derived live from the real stores (see
 *  progress.ts), so the checklist self-completes as the user connects data — it is
 *  a guided view over the existing seams, not a new source of truth. Framework-free
 *  (labels localize in the UI). */
import type { IconKey } from "@/lib/projects/icon-keys";
import type { ProjectType } from "@/lib/projects/types";

export type OnboardingStepKey = "scan" | "catalog" | "ads" | "ranks" | "channels" | "costModel";

export interface OnboardingStepDef {
  key: OnboardingStepKey;
  /** module route segment to deep-link to (the `start` module for the scan itself) */
  to: string;
  icon: IconKey;
  labelCs: string;
  labelEn: string;
  hintCs: string;
  hintEn: string;
  /** The step's DEFAULT optionality. The external-connection steps (Ads, imports,
   *  cost model) are optional because the app works end-to-end on sample data
   *  without them, so the checklist labels them as explicitly optional rather than
   *  implying a hard requirement. A type may override this — see REQUIRED_BY_TYPE,
   *  which is how `channels` is required for the types that cannot connect an ad
   *  account at all. Read `stepsForType`'s output, never `DEF` directly. */
  optional?: boolean;
  /** true for a step the tenant completes INSIDE the app — no external account, no
   *  import, no credentials, no budget. The checklist's row CTA says "open", not
   *  "connect", because there is nothing to connect: promoting `channels` to the
   *  front of the list made "Připojit" the label on the one step that connects
   *  nothing. */
  selfServe?: boolean;
}

const DEF: Record<OnboardingStepKey, OnboardingStepDef> = {
  scan: {
    key: "scan",
    to: "start",
    icon: "keywords",
    labelCs: "Naskenovat web",
    labelEn: "Scan your website",
    hintCs: "Zjistíme, co prodáváte, a naplníme aplikaci vaší firmou.",
    hintEn: "We detect what you sell and seed the app with your business.",
  },
  catalog: {
    key: "catalog",
    to: "katalog",
    icon: "catalog",
    labelCs: "Naimportovat nabídku",
    labelEn: "Import your catalog",
    hintCs: "Produkty nebo služby, o které se opřou všechny moduly.",
    hintEn: "The products or services every module grounds on.",
    optional: true,
  },
  ads: {
    key: "ads",
    to: "kampane",
    icon: "campaigns",
    labelCs: "Připojit Google Ads",
    labelEn: "Connect Google Ads",
    hintCs: "Živá data kampaní místo ukázkových.",
    hintEn: "Live campaign data instead of the sample.",
    optional: true,
  },
  ranks: {
    key: "ranks",
    // The Map module hosts the whole local-data import (rank ladder, reviews AND
    // GBP locations, via LocalLadderSource / LocalSourcePanel), so it stays the
    // single entry point now that any of the three completes this step.
    to: "mapa",
    icon: "map",
    labelCs: "Naimportovat lokální data",
    labelEn: "Import local data",
    hintCs: "Reálné pozice, recenze nebo Google Business Profile do mapy a lokálního přehledu.",
    hintEn: "Real ranks, reviews or your Google Business Profile for the map and local overview.",
    optional: true,
  },
  costModel: {
    key: "costModel",
    // The monthly report hosts the CostModelEditor (blended margin, overhead,
    // per-order cost) — the input that turns pre-COGS contribution into true profit.
    to: "mesicni-report",
    icon: "profit",
    labelCs: "Zadat marži a náklady",
    labelEn: "Enter margin & costs",
    hintCs: "Hrubá marže a náklady, aby report ukázal skutečný čistý zisk.",
    hintEn: "Gross margin and costs so the report shows true net profit.",
    optional: true,
  },
  channels: {
    key: "channels",
    to: "kanaly",
    icon: "channels",
    labelCs: "Vybrat kanály zdarma",
    labelEn: "Pick free channels",
    hintCs: "Kde se zviditelnit bez rozpočtu na reklamu.",
    hintEn: "Where to get seen without an ad budget.",
    // Optional BY DEFAULT only. For app / content / leadgen it is required — see
    // REQUIRED_BY_TYPE. Nothing external is needed to finish it, which is what
    // lets it lead the list.
    optional: true,
    selfServe: true,
  },
};

/** The checklist per project type — only steps whose completion this project can
 *  actually reach, ordered scan → free visibility → connect.
 *
 *  WHY `channels` LEADS. It used to be last in every type's order and optional in
 *  all five, sitting behind "Připojit Google Ads" — a step a tenant with no ad
 *  budget cannot complete at all. So the app's zero-budget path was the last,
 *  skippable item on a list whose blocking item was "spend money", and two UAT
 *  characters whose stated job IS this module found it by accident
 *  (uat/runs/2026-08-28-kanaly-l1/SUMMARY.md, finding K01). Free visibility is the
 *  first thing every type can actually do on day one, with no account, no
 *  credentials and no budget — so it is the first thing offered. */
const BY_TYPE: Record<ProjectType, OnboardingStepKey[]> = {
  eshop: ["scan", "channels", "catalog", "costModel", "ads"],
  app: ["scan", "channels", "ads"],
  leadgen: ["scan", "channels", "ads"],
  content: ["scan", "channels"],
  local: ["scan", "channels", "catalog", "ads", "ranks"],
};

/** Per-type overrides of a step's default optionality.
 *
 *  `channels` is REQUIRED for app / content / leadgen and stays optional for
 *  eshop / local. The split is not a preference, it is what each type can reach:
 *  an e-shop or a local business has a catalog to import and a storefront/GBP to
 *  connect, so free channels is one honest route among several. A pre-launch app,
 *  a content site or a leadgen site has no catalog step at all and typically no ad
 *  budget — for them free channels is not a nice-to-have alongside the connectors,
 *  it is the only route to a first visitor, and calling it "optional" told them the
 *  opposite. See docs/adr/0009-free-channels-lead-the-onboarding-checklist.md.
 *
 *  Exhaustive by type (not Partial) so a new ProjectType has to decide. */
const REQUIRED_BY_TYPE: Record<ProjectType, OnboardingStepKey[]> = {
  eshop: [],
  app: ["channels"],
  leadgen: ["channels"],
  content: ["channels"],
  local: [],
};

/** The resolved checklist for a project type: the type's step set, with each
 *  step's optionality resolved against REQUIRED_BY_TYPE. Callers must read this
 *  and never `DEF`, whose `optional` is only the default. */
export function stepsForType(type: ProjectType): OnboardingStepDef[] {
  const required = new Set<OnboardingStepKey>(REQUIRED_BY_TYPE[type]);
  return BY_TYPE[type].map((k) => (required.has(k) ? { ...DEF[k], optional: false } : DEF[k]));
}
