/** Per-project landing-page experiments — list / create / replace / delete. Per-user,
 *  ownership-checked; the body is coerced to a clean, bounded experiment (never trust
 *  the wire) and capped per project in the store. A persisted experiment's significant
 *  winner may enter live tenants' AI prompts as an account-proven creative pattern, so
 *  the sanitiser is the integrity boundary here. Server-only. Mirrors the annotations
 *  sub-resource route's auth shape. */
import { currentUserId } from "@/lib/session";
import { getProject } from "@/lib/projects/store";
import {
  createExperiment,
  deleteExperiment,
  listExperiments,
  updateExperiment,
} from "@/lib/lp-exp/store";
import { sanitizeExperimentInput } from "@/lib/lp-exp/types";
import { asString, readJson } from "@/lib/api/route-utils";

async function requireProject(id: string) {
  const uid = await currentUserId();
  if (!uid) return { error: Response.json({ ok: false, error: "Nepřihlášeno." }, { status: 401 }) };
  const project = await getProject(uid, id);
  if (!project) return { error: Response.json({ ok: false, error: "Projekt nenalezen." }, { status: 404 }) };
  return { project };
}

/** The project's persisted experiments (newest-first). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireProject(id);
  if (error) return error;
  return Response.json({ ok: true, items: await listExperiments(project.id) });
}

/** Create one experiment. 422 when the body is invalid (blank cluster / < 2 variants). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireProject(id);
  if (error) return error;

  const body = await readJson(req);
  const input = sanitizeExperimentInput(body);
  if (!input) {
    return Response.json({ ok: false, error: "Neplatný experiment (klastr nebo varianty)." }, { status: 422 });
  }
  const { created, items } = await createExperiment(project.id, input);
  return Response.json({ ok: true, created, items });
}

/** Replace one experiment by id (edit counts / labels / close it via status). 422 on an
 *  invalid body, 404 on an unknown id. Id comes from ?id=… or the body. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireProject(id);
  if (error) return error;

  const body = await readJson<Record<string, unknown>>(req);
  const url = new URL(req.url);
  const expId = url.searchParams.get("id") || asString(body?.id);
  if (!expId) return Response.json({ ok: false, error: "Chybí id experimentu." }, { status: 400 });

  const input = sanitizeExperimentInput(body);
  if (!input) {
    return Response.json({ ok: false, error: "Neplatný experiment (klastr nebo varianty)." }, { status: 422 });
  }
  const items = await updateExperiment(project.id, expId, input);
  if (!items) return Response.json({ ok: false, error: "Experiment nenalezen." }, { status: 404 });
  return Response.json({ ok: true, items });
}

/** Remove one experiment by id (?id=… or {id} in the body). 404 on an unknown id. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, error } = await requireProject(id);
  if (error) return error;

  const url = new URL(req.url);
  let expId = url.searchParams.get("id") ?? "";
  if (!expId) {
    const body = await readJson<{ id?: unknown }>(req);
    if (typeof body?.id === "string") expId = body.id;
  }
  if (!expId) return Response.json({ ok: false, error: "Chybí id experimentu." }, { status: 400 });

  const found = await deleteExperiment(project.id, expId);
  if (!found) return Response.json({ ok: false, error: "Experiment nenalezen." }, { status: 404 });
  return Response.json({ ok: true });
}
