/** Persist a project's business catalog (offerings). Per-user, ownership-checked,
 *  server-only. The Katalog module's "Save changes" calls this; the payload is
 *  sanitized before it's stored. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { emitProjectActivity } from "@/lib/activity/emit";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  const body = (await req.json().catch(() => null)) as { offerings?: unknown } | null;
  const offerings = sanitizeOfferings(body?.offerings, id);
  await saveOfferings(uid, id, offerings);

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
