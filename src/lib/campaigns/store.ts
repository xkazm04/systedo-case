/** Per-tenant campaign store on Firestore (server-only). Each tenant
 *  (`tenants/{tenant}`) holds its own synced campaigns, AI reports and snapshots,
 *  so the multi-user cloud isolates every user's data and runs on a persistence
 *  layer that works on serverless / multi-instance. `tenant` is resolved per
 *  request (see connector.resolveTenant): a per-user+account id for live data,
 *  `u_{userId}` for a signed-in user's sample copy, or `sample` for anonymous.
 *
 *  Per-tenant collections are small, so reads fetch the whole collection and
 *  filter in code — this keeps queries single-field (auto-indexed), with no
 *  composite indexes to provision.
 *
 *  The four concerns live in `./store/`; this file is a re-export barrel so the
 *  public surface of `@/lib/campaigns/store` stays byte-identical:
 *    - `./store/campaigns` — campaign CRUD + sync metadata (`SyncMeta`)
 *    - `./store/series`    — the daily-series store
 *    - `./store/reports`   — the AI-report store + caching
 *    - `./store/snapshots` — the sync-snapshot / change-diff engine
 *  (`./store/tenant` holds the shared root-read + `activePeriod()` helpers, and
 *  `./store/backend` the LOCAL_DB-vs-Firestore document backend the four dispatch
 *  through — both internal, intentionally not part of the public API). */
import "server-only";
import { resolveProjectTenants } from "./connector";
import { getSyncMeta, listCampaigns } from "./store/campaigns";
import type { AdsSource, Campaign, CampaignPeriod } from "./types";

export * from "./store/campaigns";
export * from "./store/series";
export * from "./store/reports";
export * from "./store/snapshots";

/** ADR-0010 — a PROJECT's campaigns: the union of its per-account tenants, every row
 *  tagged with the network it came from.
 *
 *  The key stays per-account (`…_{customerId}` for Google, `…_sklik` for Sklik); this
 *  is the read that stops a dual-network tenant from having to choose which one
 *  Adamant sees. Rows that predate the row-level `source` stamp are tagged from their
 *  TENANT's `SyncMeta.source`, which is always correct because the tenant is
 *  per-account — never guessed from the row.
 *
 *  A single-source project is byte-identical to `listCampaigns(resolveTenant(…))`:
 *  the union of one tenant is that tenant, in that tenant's own order. Tenants are
 *  read in precedence order (Google first), and a tenant that has never synced simply
 *  contributes nothing.
 *
 *  Per-tenant reads (`listCampaigns`) are untouched — the mutation paths, the analyze
 *  route and the change diff all still act on ONE tenant, which is what a union read
 *  must not be mistaken for (mutations stay Google-only until the Sklik write path
 *  lands). */
export async function listCampaignsForProject(
  userId: string | null,
  projectId?: string | null,
  period?: CampaignPeriod
): Promise<Campaign[]> {
  const tenants = await resolveProjectTenants(userId, projectId);
  const perTenant = await Promise.all(
    tenants.map(async ({ tenant, source }) => {
      const [campaigns, meta] = await Promise.all([listCampaigns(tenant, period), getSyncMeta(tenant)]);
      // The tenant's own recorded source wins over the precedence label: a tenant
      // whose last sync degraded to sample data says "sample", and that is the honest
      // tag for its rows.
      const tenantSource = (meta?.source as AdsSource | undefined) ?? source;
      return campaigns.map((c) => (c.source ? c : { ...c, source: tenantSource }));
    })
  );
  return perTenant.flat();
}
