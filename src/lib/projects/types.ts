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

/** Coerce a stored `type` to a valid ProjectType. `?? "eshop"` only catches
 *  null/undefined, but the store is schemaless — a legacy/retired/seed-script value
 *  ("shop", an old app version's type) is an *unrecognized string* that sails through
 *  and then poisons the total `Record<ProjectType, …>` lookups (TYPE_BASE → NaN
 *  dashboard; PROJECT_TYPE_META/KPI_PRESETS → thrown TypeError). Validate against the
 *  known set so both store backends are honest and the "tolerating legacy docs" promise
 *  is actually true. */
export function coerceProjectType(v: unknown): ProjectType {
  return typeof v === "string" && (PROJECT_TYPES as string[]).includes(v)
    ? (v as ProjectType)
    : "eshop";
}

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
    tagline: "Online prodej: výkon, kampaně, kreativa a obsah na jednom místě.",
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
    tagline: "Akvizice uživatelů: registrace, CAC, aktivace a obsah.",
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
    tagline: "Poptávky a hovory: leady, cena za lead a konverzní poměr.",
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
    tagline: "Publikum a obsah: návštěvnost, engagement a růst.",
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
    tagline: "Místní firmy: pozice v mapě, recenze a pobočky na jednom místě.",
    icon: "local",
    defaultAccent: "#0891b2",
    primaryGoal: "Pozice v mapě & recenze",
    primaryGoalEn: "Map rank & reviews",
    overviewLead:
      "Cíl: dominovat v místním vyhledávání. Zlepšujte pozice v mapách, pečujte o recenze a Google Business Profile napříč pobočkami.",
    overviewLeadEn:
      "Goal: dominate local search. Improve map pack rankings, nurture reviews and your Google Business Profile across locations.",
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

/** Patchable fields on an existing project. A field left `undefined` is "leave
 *  as-is"; an empty/whitespace string on a nullable field (logoUrl/domain/
 *  adsCustomerId) CLEARS it. A blank `name` is rejected (see normalizeProjectPatch),
 *  not applied — a project always has a display name. */
export type ProjectPatch = Partial<Pick<Project, "name" | "type" | "accentColor" | "logoUrl" | "domain" | "adsCustomerId">>;

/** A ProjectPatch resolved to its stored representation: only the keys actually
 *  being changed are present; a nullable field carries `null` to CLEAR it (vs.
 *  absent = leave as-is). Both store backends run patches through
 *  `normalizeProjectPatch` so they persist IDENTICAL data for identical calls —
 *  the local backend maps `null` → SQL NULL, Firestore → FieldValue.delete(). */
export interface NormalizedProjectPatch {
  name?: string;
  type?: ProjectType;
  accentColor?: string;
  logoUrl?: string | null;
  domain?: string | null;
  adsCustomerId?: string | null;
}

/** Single source of truth for patch normalization, shared by both store backends so
 *  their stored representation can't drift (only their read-back shape used to be
 *  forced to converge). Trims text fields; an empty/whitespace nullable field becomes
 *  `null` (clear). A key absent from the input stays absent from the output. */
export function normalizeProjectPatch(patch: ProjectPatch): NormalizedProjectPatch {
  const out: NormalizedProjectPatch = {};
  // A project always has a display name — createProject enforces this, so update must
  // too. Trim, and DROP a blank rename entirely (leave the existing name) rather than
  // strand a project that renders as nothing in the switcher/sidebar/reports.
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) out.name = name;
  }
  if (patch.type !== undefined) out.type = patch.type;
  if (patch.accentColor !== undefined) out.accentColor = patch.accentColor;
  if (patch.logoUrl !== undefined) out.logoUrl = patch.logoUrl.trim() || null;
  if (patch.domain !== undefined) out.domain = patch.domain.trim() || null;
  if (patch.adsCustomerId !== undefined) out.adsCustomerId = patch.adsCustomerId.trim() || null;
  return out;
}

