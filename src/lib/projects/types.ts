/** Project domain model — the unit the authed product is organized around.
 *
 *  A Project is one client/brand workspace with a `type` that drives which
 *  modules appear in the sidebar (see `modules.ts`) and which KPI preset the
 *  overview shows. Framework-free (no React, no firebase) so both the client
 *  shell and the server store can import it without dragging the other's runtime
 *  in. The Firestore CRUD lives in `store.ts`. */

import type { IconKey } from "@/lib/projects/icon-keys";
import type { SupportedLocale } from "@/lib/format";

/** The kinds of business the product adapts to. Adding one here flows through
 *  the module registry + onboarding automatically (a missing preset is a type
 *  error). */
export type ProjectType = "eshop" | "app" | "leadgen" | "content" | "local";

export const PROJECT_TYPES: ProjectType[] = ["eshop", "app", "leadgen", "content", "local"];

export interface ProjectTypeMeta {
  type: ProjectType;
  /** short label shown in the picker + switcher (cs) */
  label: string;
  /** short label shown in the picker + switcher (en) */
  labelEn: string;
  /** one-line description shown during onboarding (cs) */
  tagline: string;
  /** icon key resolved to a component in the UI layer (keeps this file
   *  framework-free) */
  icon: IconKey;
  /** default brand accent for a new project of this type (a brand-ramp hex) */
  defaultAccent: string;
  /** the headline goal this type optimizes for, shown as a pill on the overview (cs) */
  primaryGoal: string;
  /** the headline goal this type optimizes for, shown as a pill on the overview (en) */
  primaryGoalEn: string;
  /** one-line, type-specific guidance shown on the project overview (cs) */
  overviewLead: string;
  /** one-line, type-specific guidance shown on the project overview (en) */
  overviewLeadEn: string;
  /** Google Ads channel emphasis for this type, surfaced on the campaigns
   *  module (cs). Undefined for types that don't run paid campaigns (content). */
  channelFocus?: string;
  /** Google Ads channel emphasis for this type (en). */
  channelFocusEn?: string;
}

/** Metadata per type — the single source of truth the picker, switcher and
 *  onboarding all read, so a new type is one entry away from being selectable. */
export const PROJECT_TYPE_META: Record<ProjectType, ProjectTypeMeta> = {
  eshop: {
    type: "eshop",
    label: "E-shop",
    labelEn: "E-shop",
    tagline: "Online prodej — výkon, kampaně, kreativa a obsah na jednom místě.",
    icon: "store",
    defaultAccent: "#14b8b1",
    primaryGoal: "Obrat & PNO",
    primaryGoalEn: "Revenue & PNO",
    overviewLead:
      "Cíl: růst obratu při udržení PNO. Sledujte ROAS, hlídejte podíl nákladů a přesouvejte rozpočet do nejvýkonnějších kampaní.",
    overviewLeadEn:
      "Goal: grow revenue while keeping PNO in check. Track ROAS, watch cost share and shift budget to your best-performing campaigns.",
    channelFocus: "Shopping a Performance Max",
    channelFocusEn: "Shopping and Performance Max",
  },
  app: {
    type: "app",
    label: "Aplikace / SaaS",
    labelEn: "App / SaaS",
    tagline: "Akvizice uživatelů — registrace, CAC, aktivace a obsah.",
    icon: "app",
    defaultAccent: "#6366f1",
    primaryGoal: "Registrace & CAC",
    primaryGoalEn: "Signups & CAC",
    overviewLead:
      "Cíl: získávat registrace za udržitelnou cenu (CAC). Důraz na Search a Demand Gen, doplněný obsahem a SEO pro organickou akvizici.",
    overviewLeadEn:
      "Goal: acquire signups at a sustainable cost (CAC). Focus on Search and Demand Gen, complemented by content and SEO for organic acquisition.",
    channelFocus: "Search a Demand Gen",
    channelFocusEn: "Search and Demand Gen",
  },
  leadgen: {
    type: "leadgen",
    label: "Leady / služby",
    labelEn: "Leads / services",
    tagline: "Poptávky a hovory — leady, cena za lead a konverzní poměr.",
    icon: "leads",
    defaultAccent: "#fb7141",
    primaryGoal: "Leady & CPL",
    primaryGoalEn: "Leads & CPL",
    overviewLead:
      "Cíl: přivádět kvalitní poptávky za nízkou cenu za lead. Hlídejte CPL a konverzní poměr formulářů i hovorů.",
    overviewLeadEn:
      "Goal: drive quality enquiries at a low cost per lead. Monitor CPL and conversion rate across forms and calls.",
    channelFocus: "Search a kampaně pro generování poptávek",
    channelFocusEn: "Search and lead generation campaigns",
  },
  content: {
    type: "content",
    label: "Obsah / média",
    labelEn: "Content / media",
    tagline: "Publikum a obsah — návštěvnost, engagement a růst.",
    icon: "content",
    defaultAccent: "#0e9c97",
    primaryGoal: "Návštěvnost & engagement",
    primaryGoalEn: "Traffic & engagement",
    overviewLead:
      "Cíl: růst publika a engagementu. Stavte na obsahu, SEO a sociálních sítích; placené kampaně používejte na zesílení dosahu.",
    overviewLeadEn:
      "Goal: grow your audience and engagement. Build on content, SEO and social media; use paid campaigns to amplify reach.",
  },
  local: {
    type: "local",
    label: "Lokální SEO",
    labelEn: "Local SEO",
    tagline: "Místní firmy — pozice v mapě, recenze a pobočky na jednom místě.",
    icon: "local",
    defaultAccent: "#0891b2",
    primaryGoal: "Pozice v mapě & recenze",
    primaryGoalEn: "Map rank & reviews",
    overviewLead:
      "Cíl: dominovat v místním vyhledávání. Zlepšujte pozice v mapovém balíčku, pečujte o recenze a Google Business Profil napříč pobočkami.",
    overviewLeadEn:
      "Goal: dominate local search. Improve map-pack rankings, nurture reviews and your Google Business Profile across locations.",
    channelFocus: "Google Business Profile a lokální Search",
    channelFocusEn: "Google Business Profile and local Search",
  },
};

/** Resolved, locale-correct user-visible fields for a project type. */
export interface ProjectTypeMetaLocalized {
  label: string;
  primaryGoal: string;
  overviewLead: string;
  channelFocus?: string;
}

/** Return the user-visible fields for a project type in the requested locale. */
export function projectTypeMeta(
  type: ProjectType,
  locale: SupportedLocale
): ProjectTypeMetaLocalized {
  const m = PROJECT_TYPE_META[type];
  if (locale === "en") {
    return {
      label: m.labelEn,
      primaryGoal: m.primaryGoalEn,
      overviewLead: m.overviewLeadEn,
      channelFocus: m.channelFocusEn,
    };
  }
  return {
    label: m.label,
    primaryGoal: m.primaryGoal,
    overviewLead: m.overviewLead,
    channelFocus: m.channelFocus,
  };
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  /** brand accent (brand-ramp hex) used in the shell rail + client reports */
  accentColor: string;
  /** optional client logo URL, shown on client-facing reports + the branding preview */
  logoUrl?: string;
  /** optional client website/domain, shown in the switcher + overview */
  domain?: string;
  /** Forward-compatible data-isolation key. v1 leaves this undefined so the data
   *  modules keep using the existing per-user tenant (resolveTenant); a later
   *  phase sets `proj_{id}` to isolate campaign/social/etc. data per project
   *  without touching the rest of the model. */
  tenant?: string;
  /** linked Google Ads customerId once an account is connected to this project */
  adsCustomerId?: string;
  /** ISO timestamps */
  createdAt: string;
  updatedAt: string;
}

/** The fields a user supplies when creating a project. */
export interface NewProjectInput {
  name: string;
  type: ProjectType;
  accentColor?: string;
  domain?: string;
}

/** Patchable fields on an existing project. */
export type ProjectPatch = Partial<Pick<Project, "name" | "type" | "accentColor" | "logoUrl" | "domain" | "adsCustomerId">>;

