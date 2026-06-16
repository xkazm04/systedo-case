/** Self-updating, SEO-indexable client microsites. The deterministic
 *  snapshot→article bridge already turns a MetricsSnapshot into a publish-ready
 *  Article with zero AI; this gives every client a living performance page at a
 *  stable URL (/m/{slug}) that re-renders from the latest snapshot on every
 *  request and can be revalidated daily by cron. White-label brand tokens make it
 *  the agency's always-current, search-findable proof of results.
 *
 *  Data source for this slice is the case-study performance dataset; wiring a
 *  live tenant's synced series into the same snapshot is the documented next step.
 *  Server-only (Firestore registry + performance import). */
import { firestore } from "@/lib/firebase";
import { performance } from "@/lib/data";
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
  /** trailing window in days */
  periodDays: number;
  enabled: boolean;
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

/** Create or update a tenant's microsite. The slug is stable once set. */
export async function enableMicrosite(
  tenant: string,
  input: { slug: string; clientName: string; segment?: string; brandName?: string; accentColor?: string; periodDays?: number }
): Promise<MicrositeConfig> {
  const cfg: MicrositeConfig = {
    slug: input.slug,
    tenant,
    clientName: input.clientName,
    segment: input.segment || "",
    brandName: input.brandName || input.clientName,
    accentColor: input.accentColor || "#0f766e",
    periodDays: input.periodDays && [30, 90, 365].includes(input.periodDays) ? input.periodDays : 30,
    enabled: true,
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
  const asOf = performance.daily.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const snapshot = buildMetricsSnapshot(performance, {
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
