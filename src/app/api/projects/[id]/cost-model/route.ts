/** A3 — save/clear a project's cost model (blended gross margin, monthly overhead,
 *  per-order cost) so the monthly report shows true net profit after COGS. Per-user,
 *  ownership-checked. Server-only. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { sanitizeCostModel } from "@/lib/cost-model/compute";
import { saveCostModel, clearCostModel } from "@/lib/cost-model/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const clean = sanitizeCostModel(body);
  if (!clean) {
    return Response.json(
      { ok: false, error: "Neplatná marže. Zadejte hrubou marži 1–100 %." },
      { status: 400 }
    );
  }

  await saveCostModel(project.id, { ...clean, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Remove the cost model → the report reverts to pre-COGS contribution. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearCostModel(project.id);
  return Response.json({ ok: true });
}
