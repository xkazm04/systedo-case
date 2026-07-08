/** C3 — save/clear a project's competitor set, fed into the recap + social grounding
 *  so the narrative is comparative. Per-user, ownership-checked. Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { sanitizeCompetitors } from "@/lib/competitors/types";
import { saveCompetitors, clearCompetitors } from "@/lib/competitors/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const clean = sanitizeCompetitors(body);
  if (!clean) {
    return Response.json(
      { ok: false, error: "Zadejte alespoň jednoho konkurenta (jméno)." },
      { status: 400 }
    );
  }

  await saveCompetitors(project.id, { ...clean, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Remove the competitor set → the narrative drops back to self-referential. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearCompetitors(project.id);
  return Response.json({ ok: true });
}
