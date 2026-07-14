/** A3 — save/clear a project's cost model (blended gross margin, monthly overhead,
 *  per-order cost) so the monthly report shows true net profit after COGS. Per-user,
 *  ownership-checked. Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { sanitizeCostModel } from "@/lib/cost-model/compute";
import { saveCostModel, clearCostModel } from "@/lib/cost-model/store";
import { readJson } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
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
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearCostModel(project.id);
  return Response.json({ ok: true });
}
