/** Per-user rate limits for the catalog WRITE endpoints — feed import, warehouse sync,
 *  warehouse connect. Each makes an OUTBOUND call (a fetched feed URL, a provider/ERP
 *  API), so a hammered endpoint is both a load risk here and a way to amplify requests
 *  at a third party (a customer's ERP, a feed host). We reuse the app's fixed-window
 *  sqlite limiter (ai/rate-limit) — but keyed by the user id, since these are authed,
 *  not by IP. Env-tunable; server-only. */
import { rateLimit, tooManyRequests, type RateRule } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";

const MIN = 60_000;

/** Per-minute caps (per user), built lazily so env overrides are read at call time.
 *  Import is tightest (largest payload + a full parse); connect is loosest (validation
 *  only). Sync sits between (one provider round-trip). */
export const CATALOG_RATE = {
  sync: (): RateRule => ({ bucket: "catalog:sync", limit: envInt("CATALOG_SYNC_PER_MIN", 12), windowMs: MIN }),
  import: (): RateRule => ({ bucket: "catalog:import", limit: envInt("CATALOG_IMPORT_PER_MIN", 8), windowMs: MIN }),
  connect: (): RateRule => ({ bucket: "catalog:connect", limit: envInt("CATALOG_CONNECT_PER_MIN", 15), windowMs: MIN }),
};

/** Max request-body bytes for the catalog endpoints (a pasted feed can be a few MB;
 *  anything larger is rejected from the content-length before we read it). */
export const CATALOG_MAX_BODY_BYTES = envInt("CATALOG_MAX_BODY_BYTES", 6_000_000);

/** Enforce a per-user catalog rate rule. Returns a ready 429 Response when over the
 *  limit (with Retry-After), else null — the caller proceeds. */
export function enforceCatalogRate(userId: string, rule: RateRule): Response | null {
  const result = rateLimit(`user:${userId}`, [rule]);
  if (!result.ok) {
    return tooManyRequests(result.retryAfter, "Příliš mnoho požadavků na katalog. Zkuste to prosím za chvíli.");
  }
  return null;
}
