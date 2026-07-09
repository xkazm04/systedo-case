/** Persist a project's organic-channels state — the tracked per-channel status
 *  (the checklist) and, when the user pins one, an AI-generated plan that replaces
 *  the seeded sample. Per-user, ownership-checked; the body is coerced to a clean,
 *  bounded blob (never trust the wire). Server-only. Mirrors the local-signals
 *  import route's auth shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { saveOrganicChannels, clearOrganicChannels } from "@/lib/organic-channels/store";
import { sanitizeChannelState } from "@/lib/organic-channels/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const state = sanitizeChannelState(body);
  await saveOrganicChannels(project.id, { ...state, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Revert to the seeded sample plan and drop all tracked statuses. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearOrganicChannels(project.id);
  return Response.json({ ok: true });
}
