/** Per-project monthly REVENUE goal — read / set the target the live report's
 *  pacing + attainment are judged against. Per-user, ownership-checked. POST records
 *  the goal effective from a YYYY-MM month, appending to the change history via the
 *  shared idempotent primitive (a same-value save never grows the log). Server-only.
 *  Mirrors the annotations sub-resource's auth + envelope shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getProjectGoal, recordProjectGoal } from "@/lib/goals/store";
import { apiError, readJson } from "@/lib/api/route-utils";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The project's saved goal + history (null-ish → empty), for the editor to hydrate. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const stored = await getProjectGoal(g.project.id);
  return Response.json({ ok: true, goal: stored?.goal ?? null, history: stored?.history ?? [] });
}

/** Set the monthly revenue goal, effective from `effectiveMonth` (YYYY-MM; defaults
 *  to the current month). 422 when the goal is missing / non-positive or the month is
 *  malformed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;

  const body = await readJson<{ goal?: unknown; effectiveMonth?: unknown }>(req);
  const goal = Number(body?.goal);
  if (!Number.isFinite(goal) || goal <= 0) {
    return apiError(422, "Zadejte kladný měsíční cíl obratu.", "unprocessable", { envelope: "ok" });
  }
  const effectiveMonth =
    typeof body?.effectiveMonth === "string" && body.effectiveMonth
      ? body.effectiveMonth
      : new Date().toISOString().slice(0, 7);
  if (!YM.test(effectiveMonth)) {
    return apiError(422, "Neplatný měsíc (očekává se RRRR-MM).", "invalid-date", { envelope: "ok" });
  }

  const stored = await recordProjectGoal(g.project.id, effectiveMonth, Math.round(goal));
  return Response.json({ ok: true, goal: stored.goal, history: stored.history });
}
