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
 *  (`./store/tenant` holds the shared `tenantDoc()`/`activePeriod()` helpers,
 *  used internally by the four and intentionally not part of the public API). */
import "server-only";

export * from "./store/campaigns";
export * from "./store/series";
export * from "./store/reports";
export * from "./store/snapshots";
