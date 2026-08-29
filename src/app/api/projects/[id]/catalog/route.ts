/** Persist a project's business catalog (offerings). Per-user, ownership-checked,
 *  server-only. The Katalog module's "Save changes" calls this; the payload is
 *  sanitized before it's stored. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listOfferings, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { diffCatalogEvents, summarizeCatalogEvents } from "@/lib/catalog/events";
import { appendCatalogEvents } from "@/lib/catalog/events-store";
import { emitProjectActivity } from "@/lib/activity/emit";
import { readJson } from "@/lib/api/route-utils";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  const body = await readJson<{ offerings?: unknown }>(req);
  const offerings = sanitizeOfferings(body?.offerings, id);
  // Read the stored catalog BEFORE overwriting it — this is the only write path that
  // never merges, so without this read a hand-edited price would leave no trace.
  const current = (await listOfferings(uid, id)) ?? [];
  await saveOfferings(uid, id, offerings);

  // The change ledger (WP W1-A). Appended AFTER the save and best-effort: a ledger
  // outage explains a write, it must never fail one.
  const events = diffCatalogEvents(current, offerings, new Date().toISOString(), "manual");
  try {
    await appendCatalogEvents(uid, id, events);
  } catch (err) {
    console.error("[catalog-events] append failed (non-fatal):", err);
  }

  const summary = summarizeCatalogEvents(events);
  await emitProjectActivity(uid, id, {
    kind: "update",
    module: "katalog",
    severity: "info",
    title: "Katalog upraven",
    detail: `${offerings.length} položek${summary ? ` · ${summary}` : ""}`,
    actor: "Vy",
  });

  return Response.json({ ok: true, count: offerings.length });
}
