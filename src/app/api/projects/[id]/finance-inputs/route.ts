/** Direction 1 — read/save a project's owner-entered finance inputs (the /zisk
 *  module's margin scenarios, per-period real-numbers override and last-edited
 *  per-channel margins). Per-user, ownership-checked; the body is wire-sanitized
 *  (never trust the wire) and capped in the sanitizer. Server-only. Mirrors the
 *  annotations sub-resource's auth shape + machine-code convention. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getFinanceInputs, saveFinanceInputs } from "@/lib/profit/finance-inputs/store";
import { sanitizeFinanceInputs } from "@/lib/profit/finance-inputs/types";
import { apiError, readJson } from "@/lib/api/route-utils";

/** The project's saved finance inputs, or null when never entered. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  return Response.json({ ok: true, inputs: await getFinanceInputs(project.id) });
}

/** Replace the project's finance inputs. 400 when the body is not an object at all;
 *  otherwise the blob is coerced/capped and saved (an empty blob is valid). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const clean = sanitizeFinanceInputs(body);
  if (!clean) return apiError(400, "Neplatná data.", "bad-request", { envelope: "ok" });

  await saveFinanceInputs(project.id, { ...clean, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}
