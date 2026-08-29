/** Read a project's catalog CHANGE LEDGER — the durable, SKU-level record of what
 *  every catalog write path (feed import, warehouse sync, manual save) actually moved.
 *  Per-user, ownership-checked, server-only. Read-only: the ledger is appended by the
 *  write paths themselves, never by a client (there is no POST here on purpose).
 *
 *  GET /api/projects/[id]/catalog/events?limit=&key=
 *    limit — page size, newest first (default 200, hard max 500)
 *    key   — one offering's history (`sku || id`) */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listCatalogEvents } from "@/lib/catalog/events-store";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
/** A key is feed-controlled text; bound it before it reaches a store query. */
const MAX_KEY_LENGTH = 200;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), MAX_LIMIT) : DEFAULT_LIMIT;
  const key = url.searchParams.get("key")?.trim().slice(0, MAX_KEY_LENGTH) || undefined;

  // The tenant key comes from the ownership guard, never from the wire (ADR-0002).
  const events = await listCatalogEvents(uid, id, { limit, ...(key ? { key } : {}) });
  return Response.json({ ok: true, events, count: events.length, limit });
}
