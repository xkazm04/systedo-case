/** The public microsite registry — LOCAL node:sqlite backend. One row per slug in
 *  `.data/systedo.db` (table `microsites`, DDL + migration v23 in src/lib/db.ts):
 *  `slug` is the primary key (the registry is global, not per-tenant), `tenant` is
 *  the indexed owner column backing the by-tenant lookup, and `data` is the whole
 *  MicrositeConfig JSON. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface.
 *
 *  Two places where matching Firestore's semantics took a deliberate choice:
 *   - `upsert` uses `json_patch`, SQLite's RFC-7386 merge, so an omitted optional
 *     field (logoUrl, projectId) SURVIVES a re-publish exactly as it does under
 *     Firestore's `set(…, { merge: true })`. A plain blob replace would silently
 *     drop a tenant's logo on the next publish — a cross-driver divergence a caller
 *     would only discover in production.
 *   - `getByTenant` sorts by `slug` before capping, because Firestore orders an
 *     otherwise-unordered query by `__name__` (the document id — here the slug).
 *     ADR-0001: a capped read must select the same row on both drivers. */
import { getDb } from "@/lib/db";
import type { MicrositeConfig } from "./types";

interface RegistryRow {
  data: string;
}

/** A corrupt/truncated blob is NOT the same as "no such microsite": log it so the
 *  degrade is observable rather than reading as a free slug (matching the other
 *  local backends). */
function parse(row: RegistryRow | undefined, key: string): MicrositeConfig | null {
  if (!row) return null;
  try {
    return JSON.parse(row.data) as MicrositeConfig;
  } catch (err) {
    console.error("[microsite] unparseable config for %s", key, err);
    return null;
  }
}

export async function getBySlug(slug: string): Promise<MicrositeConfig | null> {
  const row = getDb().prepare("SELECT data FROM microsites WHERE slug = ?").get(slug) as
    | RegistryRow
    | undefined;
  return parse(row, slug);
}

export async function getByTenant(tenant: string): Promise<MicrositeConfig | null> {
  const row = getDb()
    .prepare("SELECT data FROM microsites WHERE tenant = ? ORDER BY slug LIMIT 1")
    .get(tenant) as RegistryRow | undefined;
  return parse(row, tenant);
}

export async function upsert(cfg: MicrositeConfig): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO microsites (slug, tenant, data, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (slug)
       DO UPDATE SET tenant     = excluded.tenant,
                     data       = json_patch(microsites.data, excluded.data),
                     updated_at = excluded.updated_at`
    )
    .run(cfg.slug, cfg.tenant, JSON.stringify(cfg), new Date().toISOString());
}

export async function clearForTenant(tenant: string): Promise<number> {
  const res = getDb().prepare("DELETE FROM microsites WHERE tenant = ?").run(tenant);
  return Number(res.changes);
}

export async function setEnabled(slug: string, enabled: boolean): Promise<void> {
  // json_set with json(?) writes a real JSON boolean, not the string "true".
  // Only `enabled` moves: the stored identity and its published `updatedAt` are
  // untouched (the row's updated_at column records when it was toggled).
  getDb()
    .prepare(
      "UPDATE microsites SET data = json_set(data, '$.enabled', json(?)), updated_at = ? WHERE slug = ?"
    )
    .run(enabled ? "true" : "false", new Date().toISOString(), slug);
}
