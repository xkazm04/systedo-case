/** Starter catalog for a brand-new project — a few clearly-editable example offerings
 *  of the type's primary kind, personalized by the captured business nature. The create
 *  API persists this at creation so every module has real, project-owned data from day
 *  one instead of the shared demo seed; the user then renames/reprices them in Katalog.
 *  Framework-free (no server-only / no Date) so the client create form can share
 *  `defaultNatureFor` and unit tests can build catalogs deterministically. */
import type {
  Offering,
  OfferingNature,
  PlanOffering,
  ProductOffering,
  ServiceOffering,
} from "./offering";
import type { ProjectType } from "@/lib/projects/types";

/** Static fallback timestamp — callers (the create API) pass the real "now". */
const STARTER_TS = "2026-01-01T00:00:00.000Z";
/** Same locality ids as the seed's LOCALITIES, inlined to keep this module leaf-pure. */
const STARTER_AREAS = ["praha", "brno", "ostrava", "plzen"];

/** The business-nature default for a type: local services default to local, everything
 *  else to online. Hybrid is always an explicit opt-in. Shared by the create form
 *  (initial value + on type change) and the create API (fallback when absent). */
export function defaultNatureFor(type: ProjectType): OfferingNature {
  return type === "leadgen" ? "local" : "online";
}

/** Sales channels a physical product is listed on, by nature. */
function productChannels(nature: OfferingNature): string[] {
  const online = ["Google Nákupy", "Zboží.cz", "Heureka", "Sklik"];
  if (nature === "local") return ["Prodejna", "Google Business Profile"];
  if (nature === "hybrid") return [...online, "Prodejna"];
  return online;
}

function eshopStarter(projectId: string, nature: OfferingNature, ts: string): ProductOffering[] {
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature,
    source: "manual" as const,
    updatedAt: ts,
    channels: productChannels(nature),
    category: "Hlavní kategorie",
    tags: ["Upravte v Katalogu"],
  };
  return [
    { kind: "product", id: `${projectId}:SKU-A`, name: "Ukázkový produkt A", price: 499, margin: 0.35, sku: "SKU-A", stock: 40, dailyVelocity: 3, emoji: "📦", ...base },
    { kind: "product", id: `${projectId}:SKU-B`, name: "Ukázkový produkt B", price: 899, margin: 0.32, sku: "SKU-B", stock: 25, dailyVelocity: 1.5, emoji: "🎁", ...base },
    { kind: "product", id: `${projectId}:SKU-C`, name: "Ukázkový produkt C", price: 1290, margin: 0.4, sku: "SKU-C", stock: 60, dailyVelocity: 4, emoji: "⭐", ...base },
  ];
}

function appStarter(projectId: string, nature: OfferingNature, ts: string): PlanOffering[] {
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature,
    source: "manual" as const,
    updatedAt: ts,
    channels: ["Google Ads", "Sklik", "Organic"],
    category: "Předplatné",
  };
  return [
    { kind: "plan", id: `${projectId}:free`, name: "Free", price: 0, interval: "month", margin: 0, competitors: [], differentiators: ["Základ zdarma"], tags: ["Bez platební karty"], ...base },
    { kind: "plan", id: `${projectId}:pro`, name: "Pro", price: 490, interval: "month", margin: 0.8, competitors: [], differentiators: ["Doplňte konkurenty v Katalogu"], tags: [], ...base },
    { kind: "plan", id: `${projectId}:team`, name: "Team", price: 990, interval: "month", margin: 0.8, competitors: [], differentiators: ["Pro týmy"], tags: [], ...base },
  ];
}

function leadgenStarter(projectId: string, nature: OfferingNature, ts: string): ServiceOffering[] {
  // Online services aren't tied to a place → no service areas; local/hybrid cover all.
  const serviceAreas = nature === "online" ? [] : STARTER_AREAS;
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature,
    source: "manual" as const,
    updatedAt: ts,
    channels: ["Google Ads", "Sklik", "Google Business Profile"],
  };
  return [
    { kind: "service", id: `${projectId}:sluzba-a`, name: "Ukázková služba A", category: "Služby", price: 5000, priceModel: "from", margin: 0.4, serviceAreas, capacityPerWeek: 10, tags: ["Upravte v Katalogu"], ...base },
    { kind: "service", id: `${projectId}:sluzba-b`, name: "Ukázková služba B", category: "Služby", price: 1500, priceModel: "from", margin: 0.5, serviceAreas, capacityPerWeek: 20, tags: [], ...base },
  ];
}

function contentStarter(projectId: string, nature: OfferingNature, ts: string): Offering[] {
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature,
    source: "manual" as const,
    updatedAt: ts,
    channels: ["Newsletter", "Web", "Instagram"],
  };
  return [
    { kind: "plan", id: `${projectId}:clenstvi`, name: "Členství", category: "Předplatné", price: 149, interval: "month", margin: 0.9, competitors: [], differentiators: ["Bez reklam"], tags: ["Měsíční předplatné"], ...base },
    { kind: "service", id: `${projectId}:sponzoring`, name: "Sponzoring newsletteru", category: "Inzerce", price: 15000, priceModel: "fixed", margin: 0.75, serviceAreas: [], tags: ["1 vydání"], ...base },
  ];
}

/** Build the starter catalog for a freshly-created project. */
export function starterCatalog(
  projectId: string,
  type: ProjectType,
  nature: OfferingNature,
  ts: string = STARTER_TS
): Offering[] {
  switch (type) {
    case "eshop":
      return eshopStarter(projectId, nature, ts);
    case "app":
      return appStarter(projectId, nature, ts);
    case "leadgen":
      return leadgenStarter(projectId, nature, ts);
    case "content":
      return contentStarter(projectId, nature, ts);
  }
}
