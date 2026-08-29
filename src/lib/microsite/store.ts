/** The public microsite registry — backend dispatcher (ADR-0001). Resolves to the
 *  local node:sqlite store when LOCAL_DB is on, else Firestore. The backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module. Both
 *  backends export an identical interface.
 *
 *  Unlike almost every other store here the registry is GLOBAL, not per-tenant: the
 *  slug is a public address space shared by every tenant, so the key is the slug and
 *  the tenant is a field. That is deliberate — it is what lets `enableMicrosite`
 *  settle ownership with a single addressable read (ADR-0002) instead of a query.
 *
 *  This module holds NO ownership logic on purpose. `getBySlug` returns whatever is
 *  stored, enabled or not, and it does NOT swallow backend errors: the ownership
 *  check in `enableMicrosite` reads through it, and a failed read must fail the
 *  write rather than silently allow a takeover. Callers that want a degraded read
 *  (the public page) catch for themselves. Server-only.
 *
 *  Invariants both backends owe:
 *   - at most one config per slug (Firestore: the doc path IS the slug; sqlite:
 *     `PRIMARY KEY (slug)`);
 *   - `upsert` MERGES into an existing config — a field the caller omits (logoUrl,
 *     projectId) survives a re-publish on both drivers (Firestore: `set(…, {merge:
 *     true})`; sqlite: `json_patch`);
 *   - `getByTenant` returns the SAME row on both drivers when a tenant somehow owns
 *     more than one slug: Firestore orders an unordered query by `__name__`, so the
 *     sqlite twin sorts by `slug` before capping (ADR-0001's capped-read rule).
 */
import { LOCAL_DB } from "@/lib/local-mode";
import { normalizeConfig, type MicrositeConfig } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The stored config for a slug, enabled or not — null when the slug is free.
 *  Throws on a backend failure (see the header). */
export async function getBySlug(slug: string): Promise<MicrositeConfig | null> {
  const cfg = await (await backend()).getBySlug(slug);
  return cfg && normalizeConfig(cfg);
}

/** The config a tenant owns (enabled or not), or null. */
export async function getByTenant(tenant: string): Promise<MicrositeConfig | null> {
  const cfg = await (await backend()).getByTenant(tenant);
  return cfg && normalizeConfig(cfg);
}

/** Every config a tenant owns (enabled or not), slug-ordered on both drivers. The
 *  single-row `getByTenant` above stays exactly as it was — the performance card
 *  wants one site; the local coverage overlay wants all of them. Each row goes
 *  through `normalizeConfig`, so a pre-`kind` document reads back as `performance`
 *  here too rather than as an untyped blob. */
export async function listByTenant(tenant: string): Promise<MicrositeConfig[]> {
  return (await (await backend()).listByTenant(tenant)).map(normalizeConfig);
}

/** Create-or-merge the config at `cfg.slug`. Merge, not replace: see the header. */
export async function upsert(cfg: MicrositeConfig): Promise<void> {
  return (await backend()).upsert(cfg);
}

/** Flip only the `enabled` flag of a stored config. Deliberately narrower than
 *  `upsert` — taking a site offline must not rewrite the white-label identity or the
 *  `updatedAt` the config was published with.
 *
 *  KNOWN ASYMMETRY, and it is unreachable rather than fixed: called with a slug that
 *  has no stored config, Firestore's merge-set CREATES a `{enabled}`-only document
 *  while sqlite's UPDATE matches nothing. Neither is a state a caller can produce —
 *  the only caller (`disableMicrosite`) has just read the config it is toggling —
 *  and forcing sqlite to agree would mean inserting a row with no tenant and no
 *  config, which is worse than the divergence it removes. */
export async function setEnabled(slug: string, enabled: boolean): Promise<void> {
  return (await backend()).setEnabled(slug, enabled);
}

/** Delete every config a tenant owns — the project-deletion cascade's hook. A
 *  deleted project must not leave its public /m/{slug} page live (the most visible
 *  orphan the product can produce). Returns the number of configs removed. */
export async function clearMicrositeForTenant(tenant: string): Promise<number> {
  return (await backend()).clearForTenant(tenant);
}
