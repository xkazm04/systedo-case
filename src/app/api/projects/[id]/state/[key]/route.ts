/** Generic per-(project, key) state persistence for module surfaces whose
 *  user-created state used to live only in the browser (the content schedule,
 *  review triage). Per-user, ownership-checked, server-only. The key is
 *  whitelisted; the payload is size-capped. A meaningful `event` (a publish, a
 *  flag) surfaces on the project-wide activity feed — a plain state save does not,
 *  to keep the feed signal, not noise. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { getProjectState, saveProjectState } from "@/lib/project-state/store";
import { isHttpProjectStateKey, projectStateSpec } from "@/lib/project-state/keys";
import { emitProjectActivity } from "@/lib/activity/emit";
import { apiError, badRequest, readJson } from "@/lib/api/route-utils";

/** Titles for the meaningful, non-noisy transitions a client may report. */
const EVENT_TITLES: Record<string, Record<string, string>> = {
  // No `published` entry on purpose: this surface cannot confirm a publish. The plan
  // hands a slot to /api/social/posts, which writes the scheduling row, and the cron
  // writes the real publish row when the post actually goes out. A title here would
  // be a client-assertable publish claim with nothing behind it.
  "content-schedule": { scheduled: "Příspěvek naplánován" },
  reviews: { "reply-published": "Odpověď na recenzi publikována", flagged: "Recenze označena majiteli" },
};

const MAX_BYTES = 256_000;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  // The whitelist is DERIVED from the central key registry (`http: true`), so a new
  // key is client-drivable only when it says so — never by forgetting a list here.
  if (!isHttpProjectStateKey(key)) return badRequest("Neznámý klíč stavu.", "invalid-type");
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;
  return Response.json({ data: await getProjectState(auth.uid, id, key) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  if (!isHttpProjectStateKey(key)) return badRequest("Neznámý klíč stavu.", "invalid-type");
  const moduleKey = projectStateSpec(key).owner;
  const auth = await requireOwnedProject(id);
  if ("error" in auth) return auth.error;

  const body = await readJson<{ data?: unknown; event?: unknown }>(req);
  if (!body || body.data === undefined) return badRequest("Chybí data.", "missing-field");
  if (JSON.stringify(body.data).length > MAX_BYTES) {
    return apiError(413, "Stav je příliš velký.", "unprocessable");
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
