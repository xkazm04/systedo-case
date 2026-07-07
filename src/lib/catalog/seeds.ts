/** PHASE 1 — seeded per-project catalogs (no store yet). Hand-authored offerings for
 *  each demo project + a type-appropriate fallback for any other project, so every
 *  module can be wired to `getProjectCatalog` and demonstrated on /dashboard without a
 *  database. Mirrors how `getProjectDataset` derives a project's reality from a shared
 *  seed. Phase 2 replaces these with a project-scoped store (manual editor + WMS sync). */
import type { Locality, Offering, PlanOffering, ProductOffering, ServiceOffering } from "./offering";
import { SAMPLE_PRODUCTS, type Product } from "./sample";
import { warehouseCatalog } from "@/lib/inventory/warehouse";

/** Deterministic seed timestamp (no Date.now at module load). */
const SEED_TS = "2026-06-01T00:00:00.000Z";

/** Shared demo service areas for local (lead-gen) businesses. */
export const LOCALITIES: Locality[] = [
  { id: "praha", name: "Praha", region: "Hlavní město Praha" },
  { id: "brno", name: "Brno", region: "Jihomoravský kraj" },
  { id: "ostrava", name: "Ostrava", region: "Moravskoslezský kraj" },
  { id: "plzen", name: "Plzeň", region: "Plzeňský kraj" },
];

const ESHOP_CHANNELS = ["Google Nákupy", "Zboží.cz", "Heureka", "Sklik"];

function productFrom(p: Product, projectId: string, source: ProductOffering["source"]): ProductOffering {
  return {
    kind: "product",
    id: `${projectId}:${p.sku}`,
    projectId,
    name: p.title,
    category: p.category,
    active: true,
    nature: "online",
    price: p.price,
    currency: "CZK",
    margin: p.margin,
    channels: ESHOP_CHANNELS,
    tags: p.usps,
    source,
    updatedAt: SEED_TS,
    sku: p.sku,
    stock: p.stock,
    dailyVelocity: p.dailyVelocity,
    restockDate: p.restockDate,
    incomingQty: p.incomingQty,
    emoji: p.emoji,
  };
}

/** e-shop (products). `demo-eshop` (Mionelo) presents as synced from Baselinker with
 *  the warehouse-grade 9-SKU nuts/seeds catalog; any other e-shop gets the frozen
 *  6-SKU storefront sample marked as a manual catalog. */
export function eshopCatalog(projectId: string, now: Date): ProductOffering[] {
  const demo = projectId === "demo-eshop";
  const base = demo ? warehouseCatalog(now) : SAMPLE_PRODUCTS;
  return base.map((p) => productFrom(p, projectId, demo ? "baselinker" : "manual"));
}

/** app / SaaS (plans + named competitors). `demo-app` = Flowbase, a project-mgmt tool. */
export function appCatalog(projectId: string): PlanOffering[] {
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature: "online" as const,
    source: "manual" as const,
    updatedAt: SEED_TS,
    channels: ["Google Ads", "Sklik", "Organic"],
    category: "Projektové řízení",
  };
  return [
    {
      kind: "plan", id: `${projectId}:flowbase-pro`, name: "Flowbase Pro",
      price: 490, interval: "month", margin: 0.82,
      competitors: [{ name: "Asana" }, { name: "monday.com" }, { name: "Trello" }, { name: "ClickUp" }, { name: "Notion" }],
      differentiators: ["České rozhraní i podpora", "Napojení na Fakturoid a Sklik", "Neomezené projekty"],
      tags: ["Onboarding do 10 minut", "EU hosting / GDPR"], ...base,
    },
    {
      kind: "plan", id: `${projectId}:flowbase-teams`, name: "Flowbase Teams",
      price: 990, interval: "month", margin: 0.8,
      competitors: [{ name: "monday.com" }, { name: "Asana" }, { name: "Jira" }],
      differentiators: ["SSO a role", "Reporting portfolia"],
      tags: ["Pro 10+ uživatelů"], ...base,
    },
    {
      kind: "plan", id: `${projectId}:flowbase-free`, name: "Flowbase Free",
      price: 0, interval: "month", margin: 0,
      competitors: [{ name: "Trello" }, { name: "Notion" }],
      differentiators: ["Zdarma do 3 projektů"],
      tags: ["Bez platební karty"], ...base,
    },
  ];
}

/** lead-gen (local services × areas). `demo-leadgen` = Klimatherm, an HVAC installer.
 *  Service names match the Lokální module's coverage matrix rows. */
export function leadgenCatalog(projectId: string): ServiceOffering[] {
  const allAreas = LOCALITIES.map((l) => l.id);
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature: "local" as const,
    source: "manual" as const,
    updatedAt: SEED_TS,
    channels: ["Google Ads", "Sklik", "Google Business Profile"],
  };
  return [
    {
      kind: "service", id: `${projectId}:montaz-klimatizaci`, name: "Montáž klimatizací",
      category: "Klimatizace", price: 12900, priceModel: "from", margin: 0.35,
      serviceAreas: allAreas, capacityPerWeek: 8,
      tags: ["Instalace do 5 dní", "Záruka 5 let"], ...base,
    },
    {
      kind: "service", id: `${projectId}:servis-a-revize`, name: "Servis a revize",
      category: "Servis", price: 1490, priceModel: "from", margin: 0.5,
      serviceAreas: allAreas, capacityPerWeek: 20,
      tags: ["Pravidelná revize", "Výjezd do 48 h"], ...base,
    },
    {
      kind: "service", id: `${projectId}:rekonstrukce-rozvodu`, name: "Rekonstrukce rozvodů",
      category: "Elektroinstalace", price: 34900, priceModel: "quote", margin: 0.28,
      serviceAreas: ["praha", "brno"], capacityPerWeek: 3,
      tags: ["Projekt i realizace"], ...base,
    },
  ];
}

/** local SEO (multi-location services × areas). `demo-local` = Dentalis, a dental clinic
 *  chain. Like lead-gen it is `nature: "local"` and keys off `LOCALITIES`, but the business
 *  is a brick-and-mortar chain whose growth lever is map-pack rank + reviews per branch,
 *  not paid-lead CPL. Service names feed the Lokální module's coverage matrix. */
export function localSeoCatalog(projectId: string): ServiceOffering[] {
  const allAreas = LOCALITIES.map((l) => l.id);
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature: "local" as const,
    source: "manual" as const,
    updatedAt: SEED_TS,
    channels: ["Google Business Profile", "Organic", "Google Ads"],
  };
  return [
    {
      kind: "service", id: `${projectId}:dentalni-hygiena`, name: "Dentální hygiena",
      category: "Prevence", price: 1290, priceModel: "from", margin: 0.6,
      serviceAreas: allAreas, capacityPerWeek: 40,
      tags: ["Objednání online", "Recall po 6 měsících"], ...base,
    },
    {
      kind: "service", id: `${projectId}:zubni-implantaty`, name: "Zubní implantáty",
      category: "Implantologie", price: 18900, priceModel: "from", margin: 0.42,
      serviceAreas: ["praha", "brno"], capacityPerWeek: 6,
      tags: ["3D plánování", "Záruka na implantát"], ...base,
    },
    {
      kind: "service", id: `${projectId}:ortodoncie-rovnatka`, name: "Ortodoncie a rovnátka",
      category: "Ortodoncie", price: 34900, priceModel: "quote", margin: 0.38,
      serviceAreas: ["praha", "brno", "ostrava"], capacityPerWeek: 5,
      tags: ["Neviditelná rovnátka", "Splátky bez navýšení"], ...base,
    },
    {
      kind: "service", id: `${projectId}:pohotovost-zubar`, name: "Zubní pohotovost",
      category: "Akutní péče", price: 990, priceModel: "from", margin: 0.55,
      serviceAreas: allAreas, capacityPerWeek: 25,
      tags: ["Ošetření týž den", "Otevřeno o víkendu"], ...base,
    },
  ];
}

/** content / media (monetized offerings — membership + placements). `demo-content` = Reflektor. */
export function contentCatalog(projectId: string): Offering[] {
  const base = {
    projectId,
    currency: "CZK",
    active: true,
    nature: "online" as const,
    source: "manual" as const,
    updatedAt: SEED_TS,
    channels: ["Newsletter", "Web", "Instagram"],
  };
  return [
    {
      kind: "plan", id: `${projectId}:premiove-clenstvi`, name: "Prémiové členství",
      category: "Předplatné", price: 149, interval: "month", margin: 0.9,
      competitors: [], differentiators: ["Bez reklam", "Kompletní archiv"],
      tags: ["Měsíční předplatné"], ...base,
    },
    {
      kind: "service", id: `${projectId}:newsletter-sponzoring`, name: "Newsletter sponzoring",
      category: "Inzerce", price: 18000, priceModel: "fixed", margin: 0.75,
      serviceAreas: [], tags: ["1 vydání", "28k odběratelů"], ...base,
    },
    {
      kind: "service", id: `${projectId}:nativni-clanek`, name: "Nativní článek",
      category: "Inzerce", price: 25000, priceModel: "from", margin: 0.7,
      serviceAreas: [], tags: ["PR článek + distribuce"], ...base,
    },
  ];
}
