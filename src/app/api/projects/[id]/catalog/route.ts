/** Persist a project's business catalog (offerings). Per-user, ownership-checked,
 *  server-only. The Katalog module's "Save changes" calls this; the payload is
 *  sanitized before it's stored. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { CatalogTooLargeError, saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { emitProjectActivity } from "@/lib/activity/emit";
import { apiError, readJson } from "@/lib/api/route-utils";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  const body = await readJson<{ offerings?: unknown }>(req);
  const offerings = sanitizeOfferings(body?.offerings, id);
  try {
    await saveOfferings(uid, id, offerings);
  } catch (err) {
    // An oversized catalog is the client's fault, not a backend failure — and the
    // local dev store has no byte cap, so this is the ONLY 4xx it ever becomes.
    if (err instanceof CatalogTooLargeError) {
      return apiError(413, "Katalog je příliš velký — odeberte některé položky.", "content-too-long");
    }
    throw err;
  }

  await emitProjectActivity(uid, id, {
    kind: "update",
    module: "katalog",
    severity: "info",
    title: "Katalog upraven",
    detail: `${offerings.length} položek`,
    actor: "Vy",
  });

  return Response.json({ ok: true, count: offerings.length });
}
