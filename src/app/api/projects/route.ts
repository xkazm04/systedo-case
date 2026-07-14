/** Project CRUD for the signed-in user — list + create. Per-user, server-only.
 *  The onboarding flow and the project switcher call this. */
import { currentUserId } from "@/lib/session";
import { createProject, listProjects } from "@/lib/projects/store";
import { saveOfferings } from "@/lib/catalog/store";
import { defaultNatureFor, starterCatalog } from "@/lib/catalog/starter";
import type { OfferingNature } from "@/lib/catalog/offering";
import { emitProjectActivity } from "@/lib/activity/emit";
import { badRequest, isProjectType, readJson } from "@/lib/api/route-utils";

const NATURES: OfferingNature[] = ["online", "local", "hybrid"];

function isNature(v: unknown): v is OfferingNature {
  return typeof v === "string" && (NATURES as string[]).includes(v);
}

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  return Response.json({ projects: await listProjects(uid) });
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const body = await readJson<{
    name?: unknown;
    type?: unknown;
    accentColor?: unknown;
    domain?: unknown;
    nature?: unknown;
  }>(req);

  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("Zadejte název projektu.");
  }
  if (!isProjectType(body.type)) {
    return badRequest("Neplatný typ projektu.");
  }

  const project = await createProject(uid, {
    name: body.name,
    type: body.type,
    accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined,
    domain: typeof body.domain === "string" ? body.domain : undefined,
  });

  // Seed a persisted starter catalog so the new project's modules have real,
  // project-owned data from day one. Best-effort: a store hiccup must not fail
  // creation — the seed fallback (getProjectCatalog) still covers the modules.
  const nature = isNature(body.nature) ? body.nature : defaultNatureFor(project.type);
  try {
    await saveOfferings(
      uid,
      project.id,
      starterCatalog(project.id, project.type, nature, new Date().toISOString())
    );
  } catch {
    /* starter seed failed — modules fall back to the seed until the user saves */
  }

  await emitProjectActivity(uid, project.id, {
    kind: "update",
    module: "nastaveni",
    severity: "success",
    title: "Projekt vytvořen",
    detail: project.name,
    actor: "Vy",
  });

  return Response.json({ project }, { status: 201 });
}
