/** Persist a project's twin — the trained per-channel voice, the style facts it
 *  learned from, the channel/autonomy config and the draft outbox. Per-user,
 *  ownership-checked; the body is coerced to a clean, bounded blob (never trust the
 *  wire — the client POSTs the whole state). Server-only. Mirrors the
 *  organic-channels route's auth shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { saveTwin, clearTwin } from "@/lib/twin/store";
import { sanitizeTwinState } from "@/lib/twin/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const state = sanitizeTwinState(body);
  await saveTwin(project.id, { ...state, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true });
}

/** Untrain the twin: back to the seeded per-type sample, empty outbox. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 });
  await clearTwin(project.id);
  return Response.json({ ok: true });
}
