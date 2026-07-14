/** Direction 1 — save a project's inventory action plan (the budget-move
 *  recommendations with their per-move state: proposed | accepted | dismissed).
 *  Per-user, ownership-checked. This ONLY records the operator's decision — it does
 *  not touch any ad account. Server-only. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { sanitizeStoredPlan } from "@/lib/inventory/plan-types";
import { savePlan } from "@/lib/inventory/plan-store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;

  const body = await req.json().catch(() => null);
  const plan = sanitizeStoredPlan(body, new Date());
  if (!plan) {
    return Response.json({ ok: false, error: "Neplatný plán." }, { status: 400 });
  }

  await savePlan(g.project.id, plan);
  return Response.json({ ok: true });
}
