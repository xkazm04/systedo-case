/** Project CRUD for the signed-in user — list + create. Per-user, server-only.
 *  The onboarding flow and the project switcher call this. */
import { auth } from "@/auth";
import { createProject, listProjects } from "@/lib/projects/store";
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";


async function userId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

function isProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && (PROJECT_TYPES as string[]).includes(v);
}

export async function GET() {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  return Response.json({ projects: await listProjects(uid) });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; type?: unknown; accentColor?: unknown; domain?: unknown }
    | null;

  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "Zadejte název projektu." }, { status: 400 });
  }
  if (!isProjectType(body.type)) {
    return Response.json({ error: "Neplatný typ projektu." }, { status: 400 });
  }

  const project = await createProject(uid, {
    name: body.name,
    type: body.type,
    accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined,
    domain: typeof body.domain === "string" ? body.domain : undefined,
  });
  return Response.json({ project }, { status: 201 });
}
