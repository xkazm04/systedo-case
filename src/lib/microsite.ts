/** Self-updating, SEO-indexable client microsites. The deterministic
 *  snapshot→article bridge already turns a MetricsSnapshot into a publish-ready
 *  Article with zero AI; this gives every client a living performance page at a
 *  stable URL (/m/{slug}) that re-renders from the latest snapshot on every
 *  request and can be revalidated daily by cron. White-label brand tokens make it
 *  the agency's always-current, search-findable proof of results.
 *
 *  Data is the case-study series SCALED PER CLIENT (by slug), so each client's
 *  microsite reads as its own reality instead of identical demo numbers for every
 *  tenant — always disclosed as illustrative and never search-indexed. A microsite
 *  whose owning PROJECT has actually synced Ads metrics substitutes the REAL series
 *  (resolveMicrositeView): same snapshot shape, honest "synced" provenance, and the
 *  page may then index. A view is either fully synced-real or fully disclosed-sample
 *  — the two series are never blended. Server-only.
 *
 *  The REGISTRY itself (which slug belongs to whom, and is it live) lives behind the
 *  dual-store dispatcher in `./microsite/store` — Firestore in the cloud, node:sqlite
 *  under LOCAL_DB — so a `dev:local` tenant can publish /m/{slug} offline. This file
 *  keeps the public API and every policy decision: slug validity, the reserved demo
 *  slug, tenant ownership, which kinds may be published, and the degrade-to-demo
 *  fallback. The store has no policy at all (ADR-0001, ADR-0002). */
import { isValidMicrositeSlug } from "@/lib/microsite-identity";
import { getBySlug, getByTenant, listByTenant, setEnabled, upsert } from "@/lib/microsite/store";
import {
  isMicrositeKind,
  type LocalPagePayload,
  type MicrositeConfig,
  type MicrositeKind,
} from "@/lib/microsite/types";
import { scaledDataset, seedScale } from "@/lib/project-data/dataset";
import { buildMetricsSnapshot, type MetricsSnapshot } from "@/lib/metrics";
import { snapshotToArticle } from "@/lib/snapshot-to-article";
import { getReportMetrics } from "@/lib/report-metrics/store";
import { isLiveMetrics, type ReportMetrics } from "@/lib/report-metrics/types";
import { isBaseCurrency } from "@/lib/campaigns/currency";
import type { PerformanceData } from "@/lib/types";
import type { Article } from "@/lib/article";

// The data contract lives beside the store (so the sqlite backend can import it
// without reaching back through this module) and is re-exported here, because
// `@/lib/microsite` is the module every caller already imports.
export type { LocalPagePayload, MicrositeConfig, MicrositeKind };

/** The kinds `enableMicrosite` will actually publish today. `lp` is declared in the
 *  type — the registry can already carry it and a document written by a later deploy
 *  reads back correctly — but its renderer does not exist yet, and accepting one here
 *  would publish a blank page at a real public URL. `local-landing` joined the list in
 *  W2-C, when its renderer (`/m/[slug]`'s local branch) actually landed. */
const PUBLISHABLE_KINDS: readonly MicrositeKind[] = ["performance", "local-landing"];

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
  // Declared, not defaulted: the demo is a literal, so it never travels through the
  // store's `normalizeConfig` (which is where a STORED legacy doc gets its kind).
  kind: "performance",
  illustrative: true,
  updatedAt: "",
};

const PERIOD_LABEL: Record<number, string> = {
  30: "30 dní",
  90: "90 dní",
  365: "12 měsíců",
};

function periodLabel(days: number): string {
  return PERIOD_LABEL[days] ?? `${days} dní`;
}

/** A microsite by slug. Falls back to the built-in demo so the route always
 *  renders something; best-effort against the registry (demo still works offline). */
export async function getMicrosite(slug: string): Promise<MicrositeConfig | null> {
  try {
    const cfg = await getBySlug(slug);
    if (cfg) return cfg.enabled ? cfg : null;
  } catch (err) {
    console.error(`[microsite] lookup failed for ${slug}:`, err);
  }
  return slug === DEMO_MICROSITE.slug ? DEMO_MICROSITE : null;
}

/** The microsite owned by a tenant (for the management card), if any. */
export async function getMicrositeForTenant(tenant: string): Promise<MicrositeConfig | null> {
  try {
    return await getByTenant(tenant);
  } catch (err) {
    console.error(`[microsite] tenant lookup failed for ${tenant}:`, err);
  }
  return null;
}

/** Thrown by enableMicrosite when the requested slug is malformed, already owned by
 *  another tenant, or the requested kind has no renderer — the route maps `code` to
 *  a 422 / 409. */
export class MicrositeSlugError extends Error {
  /** No TS parameter property here on purpose: node:test loads this module via
   *  strip-only type erasure, which cannot compile `constructor(public code…)`. */
  readonly code: "invalid-slug" | "slug-taken" | "invalid-kind";
  constructor(code: "invalid-slug" | "slug-taken" | "invalid-kind", message: string) {
    super(message);
    this.code = code;
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
  input: { slug: string; clientName: string; segment?: string; brandName?: string; accentColor?: string; logoUrl?: string; periodDays?: number; projectId?: string; kind?: MicrositeKind; local?: LocalPagePayload }
): Promise<MicrositeConfig> {
  if (!isValidMicrositeSlug(input.slug)) {
    throw new MicrositeSlugError("invalid-slug", `Invalid microsite slug: "${input.slug}"`);
  }
  // A kind whose renderer does not exist yet must never reach a public URL — the
  // page would render blank at an indexable address. Refused BEFORE the ownership
  // read, so an unpublishable request costs no registry round-trip.
  const kind: MicrositeKind = input.kind ?? "performance";
  if (!isMicrositeKind(kind) || !PUBLISHABLE_KINDS.includes(kind)) {
    throw new MicrositeSlugError("invalid-kind", `Microsite kind "${kind}" cannot be published yet`);
  }
  // A local-landing slug with no payload renders an empty page at a public, INDEXABLE
  // URL — the same failure the kind gate above exists to prevent, one level down. It
  // is `invalid-kind` rather than a new code because it is the same refusal: this
  // request cannot be published as this kind.
  if (kind === "local-landing" && !input.local) {
    throw new MicrositeSlugError("invalid-kind", "A local-landing microsite needs its page payload");
  }
  // The built-in demo slug is reserved for its own tenant — it exists even when no
  // registry document does, so the ownership read below cannot protect it.
  if (input.slug === DEMO_MICROSITE.slug && tenant !== DEMO_MICROSITE.tenant) {
    throw new MicrositeSlugError("slug-taken", `Slug "${input.slug}" is reserved`);
  }
  // Ownership: an existing config (enabled OR disabled) pins the slug to its tenant.
  // This read intentionally does NOT swallow store errors — a failed check must fail
  // the write, never silently allow a takeover. `getBySlug` is the raw store read for
  // exactly that reason; `getMicrosite` above would swallow it and hide a foreign
  // DISABLED site behind the demo fallback.
  const existing = await getBySlug(input.slug);
  if (existing && existing.tenant !== tenant) {
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
    // The owning project keys the synced-metrics lookup; a publish without a project
    // (legacy per-user tenant) simply never substitutes live data.
    ...(input.projectId ? { projectId: input.projectId } : {}),
    periodDays: input.periodDays && [30, 90, 365].includes(input.periodDays) ? input.periodDays : 30,
    enabled: true,
    // Written on EVERY upsert, so the default-on-read in the store is only ever
    // needed for documents that predate the field.
    kind,
    // The local-landing page content. Omitted (not written as undefined) for every
    // other kind, so a performance re-publish never adds a null field to its blob.
    ...(input.local ? { local: input.local } : {}),
    // The STORED flag stays true: whether the page may drop the disclosure + index
    // is decided per REQUEST by resolveMicrositeView (sync state changes over time —
    // a cleared sync must revert the page to disclosed sample without a registry
    // write). A stored `false` would go stale the moment the project's metrics are
    // cleared, publishing demo numbers as indexed "proof".
    illustrative: true,
    updatedAt: new Date().toISOString(),
  };
  await upsert(cfg);
  return cfg;
}

/** Take a tenant's microsite offline (keeps the config for re-enabling). */
export async function disableMicrosite(tenant: string): Promise<void> {
  const existing = await getMicrositeForTenant(tenant);
  if (existing) await setEnabled(existing.slug, false);
}

/** Every microsite a tenant owns (W2-C). Best-effort, like the other public reads:
 *  a registry hiccup degrades to "this tenant publishes nothing" rather than
 *  breaking the surface that asked. Ownership is the tenant argument itself — the
 *  caller derives it from the signed-in user (ADR-0002), never from a request body. */
export async function listMicrositesForTenant(tenant: string): Promise<MicrositeConfig[]> {
  try {
    return await listByTenant(tenant);
  } catch (err) {
    console.error(`[microsite] tenant list failed for ${tenant}:`, err);
    return [];
  }
}

/** Take ONE of a tenant's slugs offline — the local-landing case, where a tenant
 *  owns many pages and `disableMicrosite` (which caps at one) would darken the wrong
 *  one. Refuses a slug the tenant does not own: the stored config's `tenant` is the
 *  authority, exactly as it is for publishing. Returns whether anything moved. */
export async function disableMicrositeSlug(tenant: string, slug: string): Promise<boolean> {
  const existing = await getBySlug(slug);
  if (!existing || existing.tenant !== tenant) return false;
  await setEnabled(slug, false);
  return true;
}

/** The rendered microsite view. `live` is the page's honest source signal: robots
 *  index + no disclosure banner ONLY on a fully synced-real view. */
export interface MicrositeView {
  article: Article;
  snapshot: MetricsSnapshot;
  asOf: string;
  /** true when the series is the owning project's real synced Ads data */
  live: boolean;
}

/** Snapshot + article from ONE dataset — the shared tail of both branches. */
function buildView(
  config: MicrositeConfig,
  data: PerformanceData,
  provenance: "synced" | "illustrative"
): { article: Article; snapshot: MetricsSnapshot; asOf: string } {
  const asOf = data.daily.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const snapshot = buildMetricsSnapshot(data, {
    key: `${config.periodDays}d`,
    label: periodLabel(config.periodDays),
    days: config.periodDays,
  });
  const article = snapshotToArticle(snapshot, { name: config.clientName, segment: config.segment }, asOf, provenance);
  return { article, snapshot, asOf };
}

/** Build the microsite's DISCLOSED-SAMPLE article — deterministic, no AI, no I/O.
 *  Re-runs on every request, so the page is always current. */
export function buildMicrositeView(config: MicrositeConfig): {
  article: Article;
  snapshot: MetricsSnapshot;
  asOf: string;
} {
  // Per-client data: scale the base case-study series deterministically by the
  // microsite's slug, so each client's microsite reads as ITS OWN reality. The
  // article carries the SAME illustrative provenance the page chrome discloses via
  // `config.illustrative` — otherwise the FAQ/perex self-certify demo numbers as
  // the client's real series (and the Markdown twin has no page banner).
  const data = scaledDataset(seedScale(config.slug), { name: config.clientName });
  return buildView(config, data, config.illustrative === false ? "synced" : "illustrative");
}

/** The synced series as the microsite's PerformanceData. Follows the same
 *  neutralization rules as the report's live builder (report-metrics/build.ts):
 *  ONLY `daily` is substantiated by the sync — the sample spine's channel mix,
 *  per-day channel shares and story-event calendar must never ride under a
 *  real-data claim, and `meta` is overwritten FROM THE ROWS. `goals` is retained
 *  from the scaled spine (a forward-looking target, not a fabricated result — the
 *  ruling build.ts documents); `client` keeps the microsite's own white-label
 *  labels, so nothing of the owning project's identity reaches the public page. */
function syncedDataset(config: MicrositeConfig, metrics: ReportMetrics): PerformanceData {
  const base = scaledDataset(seedScale(config.slug), { name: config.clientName });
  const daily = [...metrics.rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: r.date,
      visits: Math.round(r.visits),
      cost: Math.round(r.cost),
      conversions: r.conversions,
      revenue: Math.round(r.revenue),
      ...(r.impressions !== undefined ? { impressions: Math.round(r.impressions) } : {}),
      ...(r.clicks !== undefined ? { clicks: Math.round(r.clicks) } : {}),
    }));
  return {
    ...base,
    channels: [],
    channelDaily: undefined,
    events: undefined,
    daily,
    meta: { disclaimer: "", asOf: daily.at(-1)?.date ?? base.meta.asOf, days: daily.length, seed: 0 },
  };
}

/** The view the public /m/{slug} page renders. Substitutes the owning project's
 *  REAL synced series when it has one — same honest liveness rule as the report
 *  and overview (isLiveMetrics: actually-synced rows, not a linked account) — else
 *  returns today's disclosed-sample view unchanged. INTEGRITY: a view is either
 *  fully synced-real (live:true, "synced" provenance) or fully disclosed-sample;
 *  the two series are never blended. A non-CZK account stays on the disclosed
 *  sample: snapshotToArticle formats koruny, and publishing a EUR series relabelled
 *  as Kč on an indexable page is the exact dishonesty this seam exists to prevent.
 *  A store hiccup degrades to the sample view — never breaks the public page. */
export async function resolveMicrositeView(config: MicrositeConfig): Promise<MicrositeView> {
  if (config.projectId) {
    try {
      const metrics = await getReportMetrics(config.projectId);
      if (isLiveMetrics(metrics) && isBaseCurrency(metrics.meta.currencyCode)) {
        return { ...buildView(config, syncedDataset(config, metrics), "synced"), live: true };
      }
    } catch (err) {
      console.error(`[microsite] synced-metrics read failed for ${config.slug}:`, err);
    }
  }
  return { ...buildMicrositeView(config), live: false };
}
