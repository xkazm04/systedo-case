/** Project domain model — the unit the authed product is organized around.
 *
 *  A Project is one client/brand workspace with a `type` that drives which
 *  modules appear in the sidebar (see `modules.ts`) and which KPI preset the
 *  overview shows. Framework-free (no React, no firebase) so both the client
 *  shell and the server store can import it without dragging the other's runtime
 *  in. The Firestore CRUD lives in `store.ts`. */

import type { IconKey } from "@/lib/projects/icon-keys";

/** The kinds of business the product adapts to. Adding one here flows through
 *  the module registry + onboarding automatically (a missing preset is a type
 *  error). */
export type ProjectType = "eshop" | "app" | "leadgen" | "content";

export const PROJECT_TYPES: ProjectType[] = ["eshop", "app", "leadgen", "content"];

export interface ProjectTypeMeta {
  type: ProjectType;
  /** short label shown in the picker + switcher (cs) */
  label: string;
  /** one-line description shown during onboarding (cs) */
  tagline: string;
  /** icon key resolved to a component in the UI layer (keeps this file
   *  framework-free) */
  icon: IconKey;
  /** default brand accent for a new project of this type (a brand-ramp hex) */
  defaultAccent: string;
  /** the headline goal this type optimizes for, shown as a pill on the overview */
  primaryGoal: string;
  /** one-line, type-specific guidance shown on the project overview */
  overviewLead: string;
  /** Google Ads channel emphasis for this type, surfaced on the campaigns
   *  module. Undefined for types that don't run paid campaigns (content). */
  channelFocus?: string;
}

/** Metadata per type — the single source of truth the picker, switcher and
 *  onboarding all read, so a new type is one entry away from being selectable. */
export const PROJECT_TYPE_META: Record<ProjectType, ProjectTypeMeta> = {
  eshop: {
    type: "eshop",
    label: "E-shop",
    tagline: "Online prodej — výkon, kampaně, kreativa a obsah na jednom místě.",
    icon: "store",
    defaultAccent: "#14b8b1",
    primaryGoal: "Obrat & PNO",
    overviewLead:
      "Cíl: růst obratu při udržení PNO. Sledujte ROAS, hlídejte podíl nákladů a přesouvejte rozpočet do nejvýkonnějších kampaní.",
    channelFocus: "Shopping a Performance Max",
  },
  app: {
    type: "app",
    label: "Aplikace / SaaS",
    tagline: "Akvizice uživatelů — registrace, CAC, aktivace a obsah.",
    icon: "app",
    defaultAccent: "#6366f1",
    primaryGoal: "Registrace & CAC",
    overviewLead:
      "Cíl: získávat registrace za udržitelnou cenu (CAC). Důraz na Search a Demand Gen, doplněný obsahem a SEO pro organickou akvizici.",
    channelFocus: "Search a Demand Gen",
  },
  leadgen: {
    type: "leadgen",
    label: "Leady / služby",
    tagline: "Poptávky a hovory — leady, cena za lead a konverzní poměr.",
    icon: "leads",
    defaultAccent: "#fb7141",
    primaryGoal: "Leady & CPL",
    overviewLead:
      "Cíl: přivádět kvalitní poptávky za nízkou cenu za lead. Hlídejte CPL a konverzní poměr formulářů i hovorů.",
    channelFocus: "Search a kampaně pro generování poptávek",
  },
  content: {
    type: "content",
    label: "Obsah / média",
    tagline: "Publikum a obsah — návštěvnost, engagement a růst.",
    icon: "content",
    defaultAccent: "#0e9c97",
    primaryGoal: "Návštěvnost & engagement",
    overviewLead:
      "Cíl: růst publika a engagementu. Stavte na obsahu, SEO a sociálních sítích; placené kampaně používejte na zesílení dosahu.",
  },
};

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  /** brand accent (brand-ramp hex) used in the shell rail + client reports */
  accentColor: string;
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
export type ProjectPatch = Partial<Pick<Project, "name" | "type" | "accentColor" | "domain" | "adsCustomerId">>;

/** The default home module for a freshly-opened project. */
export const PROJECT_HOME_SEGMENT = "";
