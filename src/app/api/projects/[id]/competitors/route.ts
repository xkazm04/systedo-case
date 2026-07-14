/** C3 — save/clear a project's competitor set, fed into the recap + social grounding
 *  so the narrative is comparative. Per-user, ownership-checked. Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { sanitizeCompetitors } from "@/lib/competitors/types";
import { saveCompetitors, clearCompetitors } from "@/lib/competitors/store";
import { readJson } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
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
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearCompetitors(project.id);
  return Response.json({ ok: true });
}
