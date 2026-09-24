/** Project CRUD for the signed-in user — list + create. Per-user, server-only.
 *  The onboarding flow and the project switcher call this. */
import { currentUserId } from "@/lib/session";
import { listProjects } from "@/lib/projects/store";
import { provisionProject } from "@/lib/projects/provision";
import type { OfferingNature } from "@/lib/catalog/offering";
import { apiError, badRequest, isProjectType, readJson } from "@/lib/api/route-utils";

const NATURES: OfferingNature[] = ["online", "local", "hybrid"];

function isNature(v: unknown): v is OfferingNature {
  return typeof v === "string" && (NATURES as string[]).includes(v);
}

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return apiError(401, "Nepřihlášeno.", "unauthorized");
  return Response.json({ projects: await listProjects(uid) });
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return apiError(401, "Nepřihlášeno.", "unauthorized");

  const body = await readJson<{
    name?: unknown;
    type?: unknown;
    accentColor?: unknown;
    domain?: unknown;
    nature?: unknown;
  }>(req);

  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return badRequest("Zadejte název projektu.", "missing-field");
  }
  if (!isProjectType(body.type)) {
    return badRequest("Neplatný typ projektu.", "invalid-type");
  }

  // One provisioning seam (lib/projects/provision): the row, a best-effort starter
  // catalog so the modules have project-owned data from day one, and the activity
  // entry. Past the row nothing throws, so a created project is always a 201.
  const { project } = await provisionProject(
    uid,
    {
      name: body.name,
      type: body.type,
      accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined,
      domain: typeof body.domain === "string" ? body.domain : undefined,
    },
    { activityTitle: "Projekt vytvořen", ...(isNature(body.nature) ? { nature: body.nature } : {}) }
  );

  return Response.json({ project }, { status: 201 });
}
