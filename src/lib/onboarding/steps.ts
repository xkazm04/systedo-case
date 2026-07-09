/** The type-aware onboarding checklist. Each step deep-links to the module that
 *  completes it; the per-step "done" is derived live from the real stores (see
 *  progress.ts), so the checklist self-completes as the user connects data — it is
 *  a guided view over the existing seams, not a new source of truth. Framework-free
 *  (labels localize in the UI). */
import type { IconKey } from "@/lib/projects/icon-keys";
import type { ProjectType } from "@/lib/projects/types";

export type OnboardingStepKey = "scan" | "catalog" | "ads" | "ranks" | "channels";

export interface OnboardingStepDef {
  key: OnboardingStepKey;
  /** module route segment to deep-link to (the `start` module for the scan itself) */
  to: string;
  icon: IconKey;
  labelCs: string;
  labelEn: string;
  hintCs: string;
  hintEn: string;
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
  },
  ads: {
    key: "ads",
    to: "kampane",
    icon: "campaigns",
    labelCs: "Připojit Google Ads",
    labelEn: "Connect Google Ads",
    hintCs: "Živá data kampaní místo ukázkových.",
    hintEn: "Live campaign data instead of the sample.",
  },
  ranks: {
    key: "ranks",
    to: "mapa",
    icon: "map",
    labelCs: "Naimportovat pozice",
    labelEn: "Import your ranks",
    hintCs: "Reálný žebříček pozic do mapy a lokálního přehledu.",
    hintEn: "A real rank ladder for the map and local overview.",
  },
  channels: {
    key: "channels",
    to: "kanaly",
    icon: "channels",
    labelCs: "Vybrat kanály zdarma",
    labelEn: "Pick free channels",
    hintCs: "Kde se zviditelnit bez rozpočtu na reklamu.",
    hintEn: "Where to get seen without an ad budget.",
  },
};

/** The connector checklist per project type — only steps whose completion this
 *  project can actually reach, ordered scan → connect → free-visibility. */
const BY_TYPE: Record<ProjectType, OnboardingStepKey[]> = {
  eshop: ["scan", "catalog", "ads", "channels"],
  app: ["scan", "ads", "channels"],
  leadgen: ["scan", "ads", "channels"],
  content: ["scan", "channels"],
  local: ["scan", "catalog", "ads", "ranks", "channels"],
};

export function stepsForType(type: ProjectType): OnboardingStepDef[] {
  return BY_TYPE[type].map((k) => DEF[k]);
}
