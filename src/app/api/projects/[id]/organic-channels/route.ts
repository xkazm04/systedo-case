/** Persist a project's organic-channels state — the tracked per-channel status
 *  (the checklist) and, when the user pins one, an AI-generated plan that replaces
 *  the seeded sample. Per-user, ownership-checked; the body is coerced to a clean,
 *  bounded blob (never trust the wire). Server-only. Mirrors the local-signals
 *  import route's auth shape. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { saveOrganicChannels, clearOrganicChannels } from "@/lib/organic-channels/store";
import { sanitizeChannelState } from "@/lib/organic-channels/types";
import { readJson } from "@/lib/api/route-utils";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const body = await readJson(req);
  const state = sanitizeChannelState(body);
  await saveOrganicChannels(project.id, { ...state, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Revert to the seeded sample plan and drop all tracked statuses. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;
  await clearOrganicChannels(project.id);
  return Response.json({ ok: true });
}
