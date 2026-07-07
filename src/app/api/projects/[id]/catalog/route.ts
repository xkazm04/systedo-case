/** Persist a project's business catalog (offerings). Per-user, ownership-checked,
 *  server-only. The Katalog module's "Save changes" calls this; the payload is
 *  sanitized before it's stored. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { saveOfferings } from "@/lib/catalog/store";
import { sanitizeOfferings } from "@/lib/catalog/validate";
import { emitProjectActivity } from "@/lib/activity/emit";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const { id } = await params;
  const project = await getProject(uid, id);
  if (!project) return Response.json({ error: "Projekt nenalezen." }, { status: 404 });

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
