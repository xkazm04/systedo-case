/** Single-project update + delete for the signed-in user. Server-only. */
import { auth } from "@/auth";
import { deleteProject, updateProject } from "@/lib/projects/store";
import { PROJECT_TYPES, type ProjectPatch, type ProjectType } from "@/lib/projects/types";


async function userId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

function isProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && (PROJECT_TYPES as string[]).includes(v);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Neplatný požadavek." }, { status: 400 });

  const patch: ProjectPatch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (isProjectType(body.type)) patch.type = body.type;
  if (typeof body.accentColor === "string") patch.accentColor = body.accentColor;
  if (typeof body.logoUrl === "string") patch.logoUrl = body.logoUrl.trim();
  if (typeof body.domain === "string") patch.domain = body.domain.trim();
  if (typeof body.adsCustomerId === "string") patch.adsCustomerId = body.adsCustomerId;

  const project = await updateProject(uid, id, patch);
  if (!project) return Response.json({ error: "Projekt nenalezen." }, { status: 404 });
  return Response.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const { id } = await params;
  await deleteProject(uid, id);
  return Response.json({ ok: true });
}
