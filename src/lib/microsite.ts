/** Self-updating, SEO-indexable client microsites. The deterministic
 *  snapshot→article bridge already turns a MetricsSnapshot into a publish-ready
 *  Article with zero AI; this gives every client a living performance page at a
 *  stable URL (/m/{slug}) that re-renders from the latest snapshot on every
 *  request and can be revalidated daily by cron. White-label brand tokens make it
 *  the agency's always-current, search-findable proof of results.
 *
 *  Data is the case-study series SCALED PER CLIENT (by slug), so each client's
 *  microsite reads as its own reality instead of identical demo numbers for every
 *  tenant. A tenant with a connected Ads source can replace the scaled base with
 *  its synced series — the snapshot shape is unchanged. Server-only (Firestore
 *  registry). */
import { firestore } from "@/lib/firebase";
import { isValidMicrositeSlug } from "@/lib/microsite-identity";
import { scaledDataset, seedScale } from "@/lib/project-data/dataset";
import { buildMetricsSnapshot, type MetricsSnapshot } from "@/lib/metrics";
import { snapshotToArticle } from "@/lib/snapshot-to-article";
import type { Article } from "@/lib/article";

export interface MicrositeConfig {
  /** stable public slug (the /m/{slug} URL) */
  slug: string;
  /** owning tenant — reserved for live-data wiring */
  tenant: string;
  clientName: string;
  segment: string;
  brandName: string;
  /** white-label accent (hex or CSS color) */
  accentColor: string;
  /** white-label logo URL, rendered in the microsite header (R08) */
  logoUrl?: string;
  /** trailing window in days */
  periodDays: number;
  enabled: boolean;
  /** true when the figures are the scaled case-study series, not a tenant's real
   *  synced data — the page then discloses it and is NOT search-indexed, so demo
   *  numbers are never published as indexed "proof". A real, Ads-connected tenant
   *  leaves this false and keeps the indexed proof page. */
  illustrative?: boolean;
  updatedAt: string;
}

/** A built-in microsite so /m/mionelo works with zero setup (matches the
 *  case-study client) — mirrors how the rest of the app ships demo-ready. */
export const DEMO_MICROSITE: MicrositeConfig = {
  slug: "mionelo",
  tenant: "sample",
  clientName: "Mionelo",
  segment: "E-shop · ořechy a superpotraviny",
  brandName: "Mionelo",
  accentColor: "#0f766e",
  periodDays: 30,
  enabled: true,
  illustrative: true,
  updatedAt: "",
};

function registry() {
  return firestore.collection("microsites");
}

const PERIOD_LABEL: Record<number, string> = {
  30: "30 dní",
  90: "90 dní",
  365: "12 měsíců",
};

function periodLabel(days: number): string {
  return PERIOD_LABEL[days] ?? `${days} dní`;
}

/** A microsite by slug. Falls back to the built-in demo so the route always
 *  renders something; best-effort against Firestore (demo still works offline). */
export async function getMicrosite(slug: string): Promise<MicrositeConfig | null> {
  try {
    const snap = await registry().doc(slug).get();
    if (snap.exists) {
      const cfg = snap.data() as MicrositeConfig;
      return cfg.enabled ? cfg : null;
    }
  } catch (err) {
    console.error(`[microsite] lookup failed for ${slug}:`, err);
  }
  return slug === DEMO_MICROSITE.slug ? DEMO_MICROSITE : null;
}

/** The microsite owned by a tenant (for the management card), if any. */
export async function getMicrositeForTenant(tenant: string): Promise<MicrositeConfig | null> {
  try {
    const snap = await registry().where("tenant", "==", tenant).limit(1).get();
    if (!snap.empty) return snap.docs[0].data() as MicrositeConfig;
  } catch (err) {
    console.error(`[microsite] tenant lookup failed for ${tenant}:`, err);
  }
  return null;
}

/** Slugs of all enabled microsites — used by the daily revalidation cron. */
export async function listEnabledSlugs(): Promise<string[]> {
  try {
    const snap = await registry().where("enabled", "==", true).get();
    return snap.docs.map((d) => d.id);
  } catch (err) {
    console.error("[microsite] list failed:", err);
    return [];
  }
}

/** Thrown by enableMicrosite when the requested slug is malformed or already owned
 *  by another tenant — the route maps `code` to a 422 / 409. */
export class MicrositeSlugError extends Error {
  constructor(
    public readonly code: "invalid-slug" | "slug-taken",
    message: string
  ) {
    super(message);
    this.name = "MicrositeSlugError";
  }
}

/** Create or update a tenant's microsite. The slug is stable once set, and that is
 *  now ENFORCED here (not just promised): the write is refused when the slug is
 *  malformed, is the built-in demo's reserved slug, or the registry doc already
 *  belongs to a DIFFERENT tenant — upsert-by-slug previously let any tenant
 *  silently overwrite another tenant's public /m/{slug} page (tenant, branding and
 *  all), hijacking its stable URL. */
export async function enableMicrosite(
  tenant: string,
  input: { slug: string; clientName: string; segment?: string; brandName?: string; accentColor?: string; logoUrl?: string; periodDays?: number }
): Promise<MicrositeConfig> {
  if (!isValidMicrositeSlug(input.slug)) {
    throw new MicrositeSlugError("invalid-slug", `Invalid microsite slug: "${input.slug}"`);
  }
  // The built-in demo slug is reserved for its own tenant — it exists even when no
  // Firestore doc does, so the ownership read below cannot protect it.
  if (input.slug === DEMO_MICROSITE.slug && tenant !== DEMO_MICROSITE.tenant) {
    throw new MicrositeSlugError("slug-taken", `Slug "${input.slug}" is reserved`);
  }
  // Ownership: an existing doc (enabled OR disabled) pins the slug to its tenant.
  // This read intentionally does NOT swallow Firestore errors — a failed check must
  // fail the write, never silently allow a takeover.
  const existing = await registry().doc(input.slug).get();
  if (existing.exists && (existing.data() as MicrositeConfig).tenant !== tenant) {
    throw new MicrositeSlugError("slug-taken", `Slug "${input.slug}" belongs to another tenant`);
  }
  const cfg: MicrositeConfig = {
    slug: input.slug,
    tenant,
    clientName: input.clientName,
    segment: input.segment || "",
    brandName: input.brandName || input.clientName,
    accentColor: input.accentColor || "#0f766e",
    ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
    periodDays: input.periodDays && [30, 90, 365].includes(input.periodDays) ? input.periodDays : 30,
    enabled: true,
    // buildMicrositeView() always renders scaledDataset() — the scaled case-study
    // series — because no live-data substitution path exists yet. Until one does,
    // every created microsite IS illustrative, so it must default to noindex +
    // disclosure. Only the code path that actually swaps in synced series may flip
    // this to false; leaving it unset would publish demo numbers as indexed "proof".
    illustrative: true,
    updatedAt: new Date().toISOString(),
  };
  await registry().doc(input.slug).set(cfg, { merge: true });
  return cfg;
}

/** Take a tenant's microsite offline (keeps the config for re-enabling). */
export async function disableMicrosite(tenant: string): Promise<void> {
  const existing = await getMicrositeForTenant(tenant);
  if (existing) await registry().doc(existing.slug).set({ enabled: false }, { merge: true });
}

/** Build the microsite's article from the latest snapshot — deterministic, no AI.
 *  Re-runs on every request, so the page is always current. */
export function buildMicrositeView(config: MicrositeConfig): {
  article: Article;
  snapshot: MetricsSnapshot;
  asOf: string;
} {
  // Per-client data: scale the base case-study series deterministically by the
  // microsite's slug, so each client's microsite reads as ITS OWN reality.
  const data = scaledDataset(seedScale(config.slug), { name: config.clientName });
  const asOf = data.daily.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const snapshot = buildMetricsSnapshot(data, {
    key: `${config.periodDays}d`,
    label: periodLabel(config.periodDays),
    days: config.periodDays,
  });
  const article = snapshotToArticle(
    snapshot,
    { name: config.clientName, segment: config.segment },
    asOf
  );
  return { article, snapshot, asOf };
}
