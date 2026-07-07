/** Generic per-(project, key) state persistence for module surfaces whose
 *  user-created state used to live only in the browser (the content schedule,
 *  review triage). Per-user, ownership-checked, server-only. The key is
 *  whitelisted; the payload is size-capped. A meaningful `event` (a publish, a
 *  flag) surfaces on the project-wide activity feed — a plain state save does not,
 *  to keep the feed signal, not noise. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import { getProjectState, saveProjectState } from "@/lib/project-state/store";
import { emitProjectActivity } from "@/lib/activity/emit";

/** Whitelisted keys → the module the activity feed attributes their events to. */
const ALLOWED: Record<string, string> = {
  "content-schedule": "obsah-plan",
  reviews: "recenze",
};

/** Titles for the meaningful, non-noisy transitions a client may report. */
const EVENT_TITLES: Record<string, Record<string, string>> = {
  "content-schedule": { published: "Příspěvek publikován (GBP)", scheduled: "Příspěvek naplánován" },
  reviews: { "reply-published": "Odpověď na recenzi publikována", flagged: "Recenze označena majiteli" },
};

const MAX_BYTES = 256_000;

async function owner(id: string): Promise<{ uid: string } | Response> {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const project = await getProject(uid, id);
  if (!project) return Response.json({ error: "Projekt nenalezen." }, { status: 404 });
  return { uid };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  if (!ALLOWED[key]) return Response.json({ error: "Neznámý klíč stavu." }, { status: 400 });
  const auth = await owner(id);
  if (auth instanceof Response) return auth;
  return Response.json({ data: await getProjectState(auth.uid, id, key) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const moduleKey = ALLOWED[key];
  if (!moduleKey) return Response.json({ error: "Neznámý klíč stavu." }, { status: 400 });
  const auth = await owner(id);
  if (auth instanceof Response) return auth;

  const body = (await req.json().catch(() => null)) as { data?: unknown; event?: unknown } | null;
  if (!body || body.data === undefined) return Response.json({ error: "Chybí data." }, { status: 400 });
  if (JSON.stringify(body.data).length > MAX_BYTES) {
    return Response.json({ error: "Stav je příliš velký." }, { status: 413 });
  }

  await saveProjectState(auth.uid, id, key, body.data);

  // Only a named transition (a publish, a flag) is worth a timeline row.
  const event = typeof body.event === "string" ? body.event : "";
  const title = event ? EVENT_TITLES[key]?.[event] : undefined;
  if (title) {
    await emitProjectActivity(auth.uid, id, {
      kind: "update",
      module: moduleKey,
      severity: event.includes("flag") ? "warning" : "success",
      title,
      detail: "",
      actor: "Vy",
    });
  }

  return Response.json({ ok: true });
}
