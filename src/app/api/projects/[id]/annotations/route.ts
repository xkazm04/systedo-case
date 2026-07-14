/** Per-project report annotations — list / add / remove "what happened here" client
 *  notes. Per-user, ownership-checked; the body is coerced to a clean, bounded draft
 *  (never trust the wire) and capped per project in the store. Server-only. Mirrors
 *  the organic-channels sub-resource route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { listAnnotations, recordAnnotation, deleteAnnotation } from "@/lib/annotations/store";
import { sanitizeAnnotationInput } from "@/lib/annotations/types";
import { readJson } from "@/lib/api/route-utils";

/** The project's annotations (newest-first). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  return Response.json({ ok: true, items: await listAnnotations(project.id) });
}

/** Add one dated note. 422 when the draft is invalid (blank text / malformed date). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const input = sanitizeAnnotationInput(body);
  if (!input) return Response.json({ ok: false, error: "Neplatná poznámka (datum nebo text)." }, { status: 422 });

  const items = await recordAnnotation(project.id, input);
  return Response.json({ ok: true, items });
}

/** Remove one note by id (?id=… or {id} in the body). 404 on an unknown id. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const url = new URL(req.url);
  let annotationId = url.searchParams.get("id") ?? "";
  if (!annotationId) {
    const body = await readJson<{ id?: unknown }>(req);
    if (typeof body?.id === "string") annotationId = body.id;
  }
  if (!annotationId) return Response.json({ ok: false, error: "Chybí id poznámky." }, { status: 400 });

  const found = await deleteAnnotation(project.id, annotationId);
  if (!found) return Response.json({ ok: false, error: "Poznámka nenalezena." }, { status: 404 });
  return Response.json({ ok: true });
}
